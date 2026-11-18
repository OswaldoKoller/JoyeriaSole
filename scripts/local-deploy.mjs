// Despliegue LOCAL de Joyería Sole (para probar la aplicación completa en esta máquina).
//
//   npm run local:up        levanta todo y deja la aplicación lista (modo docker, puerto 8080)
//   npm run local:status    estado de los servicios
//   npm run local:logs      registros de la aplicación
//   npm run local:down      detiene todo (conserva los datos)
//   npm run local:reset     detiene todo y BORRA la base de datos local (pide --yes)
//
// Opciones de `up`:
//   --mode=docker   (por defecto) imagen de producción: PostgreSQL + API + SPA en contenedores.
//   --mode=node     PostgreSQL en Docker; la API compilada corre en esta máquina (más rápido de
//                   reconstruir, útil para depurar). Sirve también la SPA, en el puerto API_PORT.
//   --demo          carga además los datos de DEMOSTRACIÓN (usuarios demo, productos y stock ficticios).
//
// Es también la instalación de la PC de la tienda (D5, docs/deployment/PC-TIENDA.md): la base de datos
// y la aplicación quedan accesibles SOLO desde esta máquina, con las cookies sin HTTPS
// (COOKIE_SECURE=false). No exponer el puerto a la red sin antes configurar HTTPS.
//
// Usuarios de PostgreSQL (D3, scripts/db-app-role.mjs): POSTGRES_USER es el superusuario del
// contenedor y solo administra (crea el usuario de la aplicación, respaldos). La aplicación, sus
// migraciones y la siembra usan APP_DB_USER (por defecto «joyeria_app»), SIN superusuario, dueño de la
// base y sin permiso TRUNCATE. `up` lo crea o lo corrige en cada ejecución (idempotente).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  DEFAULT_APP_DB_USER,
  appDatabaseUrl,
  appOwnershipSql,
  appRoleSql,
  assertAppPassword,
  assertAppRole,
  parseProtectionStatus,
  protectionStatusSql,
  scramVerifier,
} from './db-app-role.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const STATE_DIR = path.join(ROOT, '.local-deploy');
const PID_FILE = path.join(STATE_DIR, 'api.pid');
const LOG_FILE = path.join(STATE_DIR, 'api.log');
const DOCKER_APP_PORT = Number(process.env.APP_PORT ?? 8080);
// Proyecto Compose propio: el despliegue local no toca los contenedores ni el volumen de
// `npm run db:up` (proyecto «joyeria-sole»), que pueden estar en uso con datos de desarrollo.
process.env.COMPOSE_PROJECT_NAME ??= 'joyeria-local';

const [command = 'help', ...rest] = process.argv.slice(2);
const flags = new Map(
  rest
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.slice(2).split('=');
      return [key, value];
    }),
);

class DeployError extends Error {}

const print = (text) => process.stdout.write(text + '\n');
const log = (message) => print(`▸ ${message}`);

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

/**
 * Ejecuta un programa en la raíz del repo. Si falla, termina con un mensaje claro. `input` se envía
 * por la entrada estándar (nunca como argumento: los argumentos se ven en la lista de procesos).
 */
function run(cmd, args, { env = {}, capture = false, allowFail = false, input } = {}) {
  const output = capture ? 'pipe' : 'inherit';
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? (capture ? 'ignore' : 'inherit') : 'pipe', output, output],
  });
  if (!allowFail && (result.error || result.status !== 0)) {
    throw new DeployError(`Falló: ${[cmd, ...args].slice(0, 4).join(' ')}`);
  }
  return result;
}

/** Ubica el CLI de npm sin pasar por un shell (en Windows npm es un .cmd). */
function npmCliPath() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(
      path.dirname(process.execPath),
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    ),
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new DeployError('No se encontró npm. Ejecutar con `npm run local:up`.');
  return found;
}

function npm(args, env) {
  return run(process.execPath, [npmCliPath(), ...args], { env });
}

const compose = (args, options) => run('docker', ['compose', ...args], options);

/** Un puerto está ocupado si algo acepta conexiones en él (vale para 0.0.0.0 y 127.0.0.1). */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1', timeout: 1000 });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

async function firstFreePort(start, attempts = 20) {
  for (let port = start; port < start + attempts; port += 1) {
    if (!(await isPortInUse(port))) return port;
  }
  throw new DeployError(`No hay puertos libres entre ${start} y ${start + attempts - 1}.`);
}

async function waitForHealth(url, label, seconds = 90) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 2) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {
      // Todavía no responde.
    }
    await sleep(2000);
  }
  throw new DeployError(`${label} no respondió en ${seconds} s (${url}). Ver: npm run local:logs`);
}

// ---------------------------------------------------------------------------------------------
// Requisitos y configuración (.env)
// ---------------------------------------------------------------------------------------------

function checkNode() {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new DeployError(
      `Se necesita Node.js 22.12 o superior (esta máquina tiene ${process.versions.node}).`,
    );
  }
}

function checkDocker() {
  const info = run('docker', ['info', '--format', '{{.ServerVersion}}'], {
    capture: true,
    allowFail: true,
  });
  if (info.error || info.status !== 0) {
    throw new DeployError(
      'Docker no está disponible. Abrir Docker Desktop, esperar a que inicie y repetir.',
    );
  }
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] && !line.trimStart().startsWith('#')) {
      values[match[1]] = (match[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}

function setKey(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text)
    ? text.replace(pattern, () => `${key}=${value}`)
    : `${text}\n${key}=${value}\n`;
}

/** Crea .env con secretos aleatorios la primera vez; después solo lo lee. Nunca imprime secretos. */
async function ensureEnv() {
  if (!existsSync(ENV_FILE)) {
    const example = path.join(ROOT, '.env.example');
    if (!existsSync(example)) throw new DeployError('Falta .env.example; no se puede crear .env.');
    const dbPassword = randomBytes(24).toString('hex');
    const dbPort = await firstFreePort(5434);
    let text = readFileSync(example, 'utf8');
    const user = parseEnv(text).POSTGRES_USER ?? 'joyeria';
    const dbName = parseEnv(text).POSTGRES_DB ?? 'joyeria_dev';
    text = setKey(text, 'POSTGRES_PASSWORD', dbPassword);
    text = setKey(text, 'POSTGRES_PORT', String(dbPort));
    text = setKey(
      text,
      'DATABASE_URL',
      `postgresql://${user}:${dbPassword}@localhost:${dbPort}/${dbName}?schema=public`,
    );
    text = setKey(
      text,
      'TEST_DATABASE_URL',
      `postgresql://${user}:${dbPassword}@localhost:${dbPort}/joyeria_test?schema=public`,
    );
    text = setKey(text, 'AUTH_SECRET', randomBytes(48).toString('base64url'));
    text = setKey(text, 'SEED_ADMIN_PASSWORD', randomBytes(18).toString('base64url'));
    text = setKey(text, 'DEMO_USER_PASSWORD', randomBytes(18).toString('base64url'));
    writeFileSync(ENV_FILE, text, { mode: 0o600 });
    log('Se creó .env con contraseñas y secretos aleatorios (no se sube a Git).');
  }
  ensureAppDbCredentials();
  const env = parseEnv(readFileSync(ENV_FILE, 'utf8'));
  try {
    assertAppRole(env.APP_DB_USER, env.POSTGRES_USER ?? 'joyeria');
    assertAppPassword(env.APP_DB_PASSWORD);
  } catch (error) {
    throw new DeployError(error instanceof Error ? error.message : String(error));
  }
  const missing = [
    'POSTGRES_PASSWORD',
    'DATABASE_URL',
    'AUTH_SECRET',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD',
  ].filter((key) => !env[key]);
  if (missing.length > 0) throw new DeployError(`Faltan variables en .env: ${missing.join(', ')}`);
  if ((env.AUTH_SECRET ?? '').length < 32)
    throw new DeployError('AUTH_SECRET debe tener al menos 32 caracteres.');
  const placeholders = Object.entries(env).filter(
    ([key, value]) => /PASSWORD|SECRET/.test(key) && /^(cambiar|reemplazar)/.test(value),
  );
  if (placeholders.length > 0) {
    console.warn(
      `⚠ .env aún tiene valores de ejemplo en: ${placeholders.map(([key]) => key).join(', ')}. ` +
        'Funciona en local, pero conviene cambiarlos.',
    );
  }
  return env;
}

/**
 * D3: agrega a .env el usuario de PostgreSQL de la aplicación (sin superusuario) si todavía no está.
 * Una instalación anterior lo recibe en su próximo `local:up`. Nunca imprime la contraseña.
 */
function ensureAppDbCredentials() {
  const original = readFileSync(ENV_FILE, 'utf8');
  const current = parseEnv(original);
  const missing = ['APP_DB_USER', 'APP_DB_PASSWORD'].filter((key) => !current[key]);
  if (missing.length === 0) return;
  const values = {
    APP_DB_USER: DEFAULT_APP_DB_USER,
    APP_DB_PASSWORD: randomBytes(24).toString('hex'),
  };
  let text = original;
  const appended = [];
  for (const key of missing) {
    if (new RegExp(`^${key}=`, 'm').test(text)) text = setKey(text, key, values[key]);
    else appended.push(`${key}=${values[key]}`);
  }
  if (appended.length > 0) {
    text =
      `${text.trimEnd()}\n\n` +
      '# Usuario de PostgreSQL de la aplicación, sin superusuario (D3). Lo agregó `npm run local:up`.\n' +
      `${appended.join('\n')}\n`;
  }
  writeFileSync(ENV_FILE, text, { mode: 0o600 });
  log(
    `Se agregó a .env el usuario de la base para la aplicación (${missing.join(', ')}). ` +
      'Actualice la copia guardada de .env.',
  );
}

// ---------------------------------------------------------------------------------------------
// Usuario de PostgreSQL de la aplicación (D3, scripts/db-app-role.mjs)
// ---------------------------------------------------------------------------------------------

function dbSettings(env) {
  return {
    superuser: env.POSTGRES_USER ?? 'joyeria',
    database: env.POSTGRES_DB ?? 'joyeria_dev',
    port: env.POSTGRES_PORT ?? '5434',
    role: env.APP_DB_USER ?? DEFAULT_APP_DB_USER,
  };
}

/** URL con la que se conectan, desde esta máquina, las migraciones, la siembra y la API (modo node). */
function appUrl(env) {
  const { database, port, role } = dbSettings(env);
  return appDatabaseUrl({ role, password: env.APP_DB_PASSWORD, host: 'localhost', port, database });
}

/** Variables para los procesos de esta máquina que deben conectarse como el usuario de la aplicación. */
const asApp = (env) => ({ ...env, DATABASE_URL: appUrl(env) });

/**
 * Ejecuta SQL como superusuario dentro del contenedor de la base. El SQL va por la entrada estándar
 * (no como argumento) y la contraseña solo viaja como verificador SCRAM.
 */
function psqlAdmin(env, sql, { query = false } = {}) {
  const { superuser, database } = dbSettings(env);
  const args = ['exec', '-T', 'db', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1'];
  args.push('-U', superuser, '-d', database);
  if (query) args.push('-At', '-F', '|');
  const result = compose(args, { input: sql, capture: true, allowFail: true });
  if (result.error || result.status !== 0) {
    const detail = (result.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' ');
    throw new DeployError(`PostgreSQL rechazó la operación: ${detail || 'sin detalle'}`);
  }
  return result.stdout ?? '';
}

/**
 * Crea o corrige el usuario de la aplicación, le pasa la base y le quita TRUNCATE. Idempotente: en una
 * instalación anterior traspasa la primera vez las tablas que estaban a nombre del superusuario.
 */
function prepareAppDatabase(env) {
  const { role } = dbSettings(env);
  log(`Preparando el usuario de la base para la aplicación («${role}», sin superusuario)…`);
  const verifier = scramVerifier(env.APP_DB_PASSWORD);
  psqlAdmin(
    env,
    `SET lock_timeout = '30s';\n${appRoleSql({ role, verifier })}${appOwnershipSql({ role })}`,
  );
}

/** Estado de la protección del libro (D3), en una línea para el resumen y `local:status`. */
function protectionLine(env) {
  const { role } = dbSettings(env);
  try {
    const status = parseProtectionStatus(
      psqlAdmin(env, protectionStatusSql({ role }), { query: true }),
    );
    return status.active
      ? `Protección del libro: activa (la aplicación usa «${role}», sin superusuario ni TRUNCATE)`
      : `⚠ Protección del libro: INACTIVA (${status.reasons.join('; ')}). Repetir npm run local:up.`;
  } catch {
    return '⚠ Protección del libro: no se pudo consultar (¿está corriendo la base?)';
  }
}

/** Dependencias del repo en esta máquina (la siembra y la compilación del modo node las necesitan). */
function ensureDependencies(env) {
  if (existsSync(path.join(ROOT, 'node_modules', '.package-lock.json'))) return;
  log('Instalando dependencias (npm ci)…');
  npm(['ci'], env);
}

/** Siembra con el usuario de la aplicación (`env` ya trae su DATABASE_URL, ver `asApp`). */
function seed(env, demo) {
  log('Aplicando datos iniciales (idempotente)…');
  npm(['run', 'db:seed'], env);
  if (demo) {
    log('Cargando datos de DEMOSTRACIÓN…');
    npm(['run', 'db:seed:demo'], env);
  }
}

// ---------------------------------------------------------------------------------------------
// Proceso de la API (modo node)
// ---------------------------------------------------------------------------------------------

function readPid() {
  if (!existsSync(PID_FILE)) return undefined;
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    rmSync(PID_FILE, { force: true });
    return undefined;
  }
}

function stopNodeApi() {
  const pid = readPid();
  if (pid === undefined) return false;
  try {
    process.kill(pid);
  } catch {
    // Ya había terminado.
  }
  rmSync(PID_FILE, { force: true });
  return true;
}

function startNodeApi(env) {
  mkdirSync(STATE_DIR, { recursive: true });
  const port = Number(env.API_PORT ?? 3000);
  const out = openSync(LOG_FILE, 'w');
  try {
    // Las variables del entorno tienen prioridad sobre --env-file: estas fijan el modo «local».
    const child = spawn(
      process.execPath,
      ['--env-file=.env', path.join('apps', 'api', 'dist', 'server.js')],
      {
        cwd: ROOT,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', out, out],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
          DATABASE_URL: appUrl(env),
          API_HOST: '127.0.0.1',
          API_PORT: String(port),
          WEB_DIST_DIR: path.join(ROOT, 'apps', 'web', 'dist'),
          COOKIE_SECURE: 'false',
          TRUST_PROXY_HOPS: '0',
          CORS_ORIGIN: `http://localhost:${port}`,
          FRONTEND_URL: `http://localhost:${port}`,
        },
      },
    );
    child.unref();
    writeFileSync(PID_FILE, String(child.pid));
  } finally {
    closeSync(out);
  }
  return port;
}

// ---------------------------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------------------------

function summary(url, env, demo) {
  print(`
✔ Joyería Sole está corriendo en ${url}

  ${protectionLine(env)}

  Administrador:  ${env.SEED_ADMIN_EMAIL}
  Contraseña:     valor de SEED_ADMIN_PASSWORD en .env (cámbiela tras el primer ingreso)${
    demo
      ? `
  Usuarios demo:  demo-admin@, demo-inventario@, demo-vendedor@example.invalid
                  (contraseña: DEMO_USER_PASSWORD en .env)`
      : ''
  }

  Estado: npm run local:status · Registros: npm run local:logs · Detener: npm run local:down`);
}

async function up() {
  checkNode();
  checkDocker();
  const mode = flags.get('mode') ?? 'docker';
  if (!['docker', 'node'].includes(mode)) throw new DeployError('--mode debe ser docker o node.');
  const demo = flags.has('demo');
  const env = await ensureEnv();

  log('Iniciando PostgreSQL…');
  compose(['up', '-d', '--wait', '--wait-timeout', '120', 'db']);
  prepareAppDatabase(env);

  if (mode === 'docker') {
    if (readPid() !== undefined) stopNodeApi();
    const ours = compose(['ps', '--status', 'running', '--services'], {
      env: { APP_PORT: String(DOCKER_APP_PORT) },
      capture: true,
      allowFail: true,
    }).stdout?.split(/\s+/);
    if (!ours?.includes('app') && (await isPortInUse(DOCKER_APP_PORT))) {
      throw new DeployError(
        `El puerto ${DOCKER_APP_PORT} está ocupado. Usar otro: APP_PORT=8081 npm run local:up`,
      );
    }
    log('Construyendo e iniciando la imagen de producción (la primera vez tarda varios minutos)…');
    // El contenedor se conecta con APP_DB_USER (docker-compose.yml). Se pasan explícitamente para que
    // una variable del mismo nombre en la consola no cambie el usuario recién preparado.
    compose(
      ['--profile', 'prod', 'up', '-d', '--build', '--wait', '--wait-timeout', '240', 'app'],
      {
        env: {
          APP_PORT: String(DOCKER_APP_PORT),
          APP_DB_USER: dbSettings(env).role,
          APP_DB_PASSWORD: env.APP_DB_PASSWORD,
        },
      },
    );
    ensureDependencies(env);
    seed(asApp(env), demo);
    await waitForHealth(`http://127.0.0.1:${DOCKER_APP_PORT}/api/v1/health`, 'La aplicación');
    summary(`http://localhost:${DOCKER_APP_PORT}`, env, demo);
    return;
  }

  // Modo node
  const port = Number(env.API_PORT ?? 3000);
  const restarting = stopNodeApi();
  if (!restarting && (await isPortInUse(port))) {
    throw new DeployError(
      `El puerto ${port} está ocupado (¿otra API o \`npm run dev\`?). Cambiar API_PORT en .env.`,
    );
  }
  compose(['--profile', 'prod', 'stop', 'app'], { allowFail: true, capture: true });
  ensureDependencies(env);
  log('Compilando API y web…');
  npm(['run', 'build'], env);
  log('Aplicando migraciones…');
  npm(['run', 'db:deploy'], asApp(env));
  // Lo que en la imagen hace prisma/privileges/revoke-app-truncate.sql en cada arranque.
  prepareAppDatabase(env);
  seed(asApp(env), demo);
  log('Iniciando la API…');
  startNodeApi(env);
  await waitForHealth(`http://127.0.0.1:${port}/api/v1/health`, 'La API');
  summary(`http://localhost:${port}`, env, demo);
}

function down() {
  checkDocker();
  if (stopNodeApi()) log('API local detenida.');
  compose(['--profile', 'prod', 'down']);
  log('Servicios detenidos. Los datos se conservan (volumen db-data).');
}

async function status() {
  const pid = readPid();
  log(
    pid === undefined
      ? 'API en esta máquina: detenida'
      : `API en esta máquina: corriendo (PID ${pid})`,
  );
  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], {
    capture: true,
    allowFail: true,
  });
  if (docker.error || docker.status !== 0) {
    log('Docker: no disponible');
    return;
  }
  compose(['--profile', 'prod', 'ps', '--all']);
  const env = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
  if (env.APP_DB_USER) log(protectionLine(env));
  for (const port of [DOCKER_APP_PORT, Number(env.API_PORT ?? 3000)]) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
        signal: AbortSignal.timeout(2000),
      });
      log(`http://localhost:${port} → ${response.ok ? 'responde' : `HTTP ${response.status}`}`);
    } catch {
      log(`http://localhost:${port} → sin respuesta`);
    }
  }
}

function logs() {
  if (readPid() !== undefined && existsSync(LOG_FILE)) {
    const lines = readFileSync(LOG_FILE, 'utf8').trimEnd().split('\n');
    print(lines.slice(-100).join('\n'));
    return;
  }
  checkDocker();
  compose(['--profile', 'prod', 'logs', '--tail', '100', 'app'], { allowFail: true });
}

function reset() {
  if (!flags.has('yes')) {
    throw new DeployError(
      'Esto BORRA la base de datos local. Repetir con: npm run local:reset -- --yes',
    );
  }
  checkDocker();
  stopNodeApi();
  compose(['--profile', 'prod', 'down', '--volumes']);
  rmSync(STATE_DIR, { recursive: true, force: true });
  log('Base de datos local eliminada. `npm run local:up` crea una nueva.');
}

function help() {
  print(`Uso: node scripts/local-deploy.mjs <comando> [opciones]

  up [--mode=docker|node] [--demo]   levanta la aplicación (por defecto: docker, puerto ${DOCKER_APP_PORT})
  down                               detiene todo, conservando los datos
  status                             estado de los servicios
  logs                               últimos registros de la aplicación
  reset --yes                        detiene todo y borra la base de datos local`);
}

try {
  switch (command) {
    case 'up':
      await up();
      break;
    case 'down':
      down();
      break;
    case 'status':
      await status();
      break;
    case 'logs':
      logs();
      break;
    case 'reset':
      reset();
      break;
    default:
      help();
  }
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : 'Falló el despliegue local'}`);
  process.exitCode = 1;
}

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
// No es una herramienta de producción: la base de datos y la aplicación quedan accesibles solo desde
// esta máquina, con las cookies sin HTTPS (COOKIE_SECURE=false). Nunca apuntarlo a datos reales.
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

/** Ejecuta un programa en la raíz del repo. Si falla, termina con un mensaje claro. */
function run(cmd, args, { env = {}, capture = false, allowFail = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
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
  const env = parseEnv(readFileSync(ENV_FILE, 'utf8'));
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

/** Dependencias del repo en esta máquina (la siembra y la compilación del modo node las necesitan). */
function ensureDependencies(env) {
  if (existsSync(path.join(ROOT, 'node_modules', '.package-lock.json'))) return;
  log('Instalando dependencias (npm ci)…');
  npm(['ci'], env);
}

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
          API_HOST: '127.0.0.1',
          API_PORT: String(port),
          WEB_DIST_DIR: path.join(ROOT, 'apps', 'web', 'dist'),
          COOKIE_SECURE: 'false',
          TRUST_PROXY: 'false',
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
    compose(
      ['--profile', 'prod', 'up', '-d', '--build', '--wait', '--wait-timeout', '240', 'app'],
      {
        env: { APP_PORT: String(DOCKER_APP_PORT) },
      },
    );
    ensureDependencies(env);
    seed(env, demo);
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
  npm(['run', 'db:deploy'], env);
  seed(env, demo);
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

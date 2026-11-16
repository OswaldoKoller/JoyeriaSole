// Respaldo automático de la base de datos de Joyería Sole al disco local.
//
//   npm run backup                  crea un respaldo ahora (carpeta, verificación y limpieza incluidas)
//   npm run backup:status           lista los respaldos y dice si la tarea diaria está programada
//   npm run backup:verify           restaura el último respaldo en una base TEMPORAL y compara cifras
//   npm run backup:schedule         programa el respaldo diario en Windows (hora con --at=HH:MM)
//   npm run backup:unschedule       quita la tarea programada
//   npm run backup:restore -- <archivo> --yes
//                                   DEVUELVE el sistema a ese respaldo (hace antes una copia de seguridad)
//
// Qué hace `run`: crea la carpeta de respaldos (y una subcarpeta por año/mes) si no existe, vuelca
// la base con `pg_dump` desde el contenedor de PostgreSQL, comprueba que el archivo se pueda leer,
// guarda su huella SHA-256 y un manifiesto con cifras de control, lo cifra si hay frase, hace una
// segunda copia en BACKUP_EXTRA_DIR (disco externo o carpeta de Google Drive) y borra los respaldos
// viejos según la retención. Nunca toca la base de datos en uso: solo la lee.
//
// Configuración (variables de entorno o `.env` de la raíz; todo tiene un valor por defecto):
//   BACKUP_DIR            carpeta de respaldos        (por defecto: <carpeta del usuario>/respaldos-joyeria-sole)
//   BACKUP_EXTRA_DIR      segunda copia (opcional)    p. ej. la carpeta que sincroniza Google Drive
//   BACKUP_PASSPHRASE     frase de cifrado (opcional, 12+ caracteres). RECOMENDADA si hay segunda copia en la nube.
//   BACKUP_KEEP_DAILY     días recientes que se conservan (por defecto 14)
//   BACKUP_KEEP_MONTHLY   meses recientes que se conservan (por defecto 12)
//   BACKUP_EXTRA_KEEP_DAILY / BACKUP_EXTRA_KEEP_MONTHLY   lo mismo para la segunda copia (por defecto 7 y 3:
//                         Google Drive gratis tiene 15 GB; con fotos, cada respaldo puede pesar cientos de MB)
//   BACKUP_CONTAINER      contenedor de PostgreSQL (por defecto, el servicio `db` del proyecto Compose)
//   COMPOSE_PROJECT_NAME  proyecto Compose (por defecto `joyeria-local`, el de `npm run local:up`)
//
// Códigos de salida: 0 = todo bien · 1 = falló · 2 = el respaldo local está bien pero falló la segunda copia.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import {
  backupFileName,
  decryptFile,
  encryptFile,
  monthFolder,
  parseBackupName,
  parseEnv,
  planRetention,
  positiveInt,
} from './backup-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const TASK_NAME = 'JoyeriaSole-Respaldo';
const COUNT_TABLES = [
  'users',
  'products',
  'product_variants',
  'inventory_movements',
  'sales',
  'sale_exchanges',
  'cash_sessions',
];

class BackupError extends Error {}

const [command = 'run', ...rest] = process.argv.slice(2);
const flags = new Map(
  rest
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.slice(2).split('=');
      return [key, value];
    }),
);
const positional = rest.filter((arg) => !arg.startsWith('--'));

// ---------------------------------------------------------------------------------------------
// Configuración y registro
// ---------------------------------------------------------------------------------------------

function loadConfig() {
  const envFile = path.join(ROOT, '.env');
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const get = (key) => process.env[key] ?? fromFile[key];
  return {
    dir: path.resolve(get('BACKUP_DIR') ?? path.join(os.homedir(), 'respaldos-joyeria-sole')),
    extraDir: get('BACKUP_EXTRA_DIR') ? path.resolve(get('BACKUP_EXTRA_DIR')) : null,
    passphrase: get('BACKUP_PASSPHRASE') || null,
    keepDaily: positiveInt(get('BACKUP_KEEP_DAILY'), 14),
    keepMonthly: positiveInt(get('BACKUP_KEEP_MONTHLY'), 12),
    extraKeepDaily: positiveInt(get('BACKUP_EXTRA_KEEP_DAILY'), 7),
    extraKeepMonthly: positiveInt(get('BACKUP_EXTRA_KEEP_MONTHLY'), 3),
    container: get('BACKUP_CONTAINER') || null,
    project: get('COMPOSE_PROJECT_NAME') ?? 'joyeria-local',
    dbUser: get('POSTGRES_USER') ?? 'joyeria',
    dbName: get('POSTGRES_DB') ?? 'joyeria_dev',
  };
}

let logFile = null;
function log(message) {
  const line = `[${new Date().toLocaleString('sv-SE')}] ${message}`;
  process.stdout.write(`${line}\n`);
  if (logFile) {
    try {
      appendFileSync(logFile, `${line}\n`);
    } catch {
      // Sin registro en archivo: la consola basta.
    }
  }
}

/** Registro con rotación simple: pasado 1 MB se conserva el anterior como `.1`. */
function openLog(dir) {
  mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'respaldo.log');
  try {
    if (existsSync(logFile) && statSync(logFile).size > 1024 * 1024) {
      renameSync(logFile, `${logFile}.1`);
    }
  } catch {
    // La rotación es opcional.
  }
}

// ---------------------------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------------------------

function dockerSync(args, options = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000, ...options });
}

function resolveContainer(config) {
  const info = dockerSync(['info', '--format', '{{.ServerVersion}}']);
  if (info.error || info.status !== 0) {
    throw new BackupError(
      'Docker no está disponible. Abra Docker Desktop, espere a que inicie y repita.',
    );
  }
  if (config.container) return config.container;
  const result = dockerSync(['compose', '-p', config.project, 'ps', '-q', 'db'], { cwd: ROOT });
  const id = (result.stdout ?? '').trim().split(/\r?\n/)[0];
  if (result.status !== 0 || !/^[a-f0-9]{12,64}$/.test(id ?? '')) {
    throw new BackupError(
      `No se encontró la base de datos del proyecto «${config.project}». ` +
        'Compruebe que el sistema está encendido (npm run local:up).',
    );
  }
  return id;
}

/** Ejecuta un comando dentro del contenedor y devuelve su salida de texto. */
function exec(container, args, { allowFail = false } = {}) {
  const result = dockerSync(['exec', container, ...args]);
  if (result.status !== 0 && !allowFail) {
    throw new BackupError(`Falló «${args[0]}»: ${(result.stderr ?? '').trim().slice(0, 400)}`);
  }
  return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
}

/** Ejecuta un comando en el contenedor leyendo su entrada de un archivo (`pg_restore`). */
function execWithFileInput(container, args, file) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new BackupError(`Falló «${args[0]}»: ${stderr.trim().slice(0, 400)}`));
    });
    pipeline(createReadStream(file), child.stdin).catch(() => undefined);
  });
}

/** `pg_dump` del contenedor directo a un archivo local. */
function dumpTo(container, config, target) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        container,
        'pg_dump',
        '-U',
        config.dbUser,
        '-d',
        config.dbName,
        '--format=custom',
        '--no-owner',
        '--compress=6',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    const out = createWriteStream(target, { mode: 0o600 });
    const written = pipeline(child.stdout, out);
    // Se atiende más abajo, al cerrar el proceso; esto evita un aviso de rechazo sin manejar.
    written.catch(() => undefined);
    child.on('close', async (code) => {
      try {
        await written;
      } catch (error) {
        reject(error);
        return;
      }
      if (code === 0) resolve();
      else reject(new BackupError(`pg_dump falló: ${stderr.trim().slice(0, 400)}`));
    });
  });
}

/**
 * Cifras de control (filas por tabla clave) en UNA sola llamada a `psql`: cada tabla es un `-c`
 * propio, así una tabla que no existe (base más antigua) no impide contar las demás y queda en `null`.
 */
function countRows(container, config, database) {
  const args = ['psql', '-U', config.dbUser, '-d', database, '-At', '-F', '|'];
  for (const table of COUNT_TABLES) args.push('-c', `SELECT '${table}', count(*) FROM ${table}`);
  const result = exec(container, args, { allowFail: true });
  const counts = Object.fromEntries(COUNT_TABLES.map((table) => [table, null]));
  for (const line of result.out.split(/\r?\n/)) {
    const [table, value] = line.split('|');
    if (table && table in counts && /^\d+$/.test(value ?? '')) counts[table] = Number(value);
  }
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Utilidades de archivos
// ---------------------------------------------------------------------------------------------

async function sha256Of(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** Respaldos de una carpeta (recursivo dos niveles: año/mes), del más viejo al más nuevo. */
function listBackups(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (folder, depth) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory() && depth < 2) walk(full, depth + 1);
      else if (entry.isFile()) {
        const parsed = parseBackupName(entry.name);
        if (parsed) found.push({ ...parsed, path: full, bytes: statSync(full).size });
      }
    }
  };
  walk(dir, 0);
  return found.sort((a, b) => a.date - b.date);
}

function formatSize(bytes) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

/** Borra los respaldos que la retención descarta (solo archivos con NUESTRO nombre) y su manifiesto. */
function prune(dir, retention) {
  const backups = listBackups(dir);
  const { remove } = planRetention(
    backups.map((backup) => backup.name),
    retention,
  );
  for (const name of remove) {
    const backup = backups.find((item) => item.name === name);
    if (!backup) continue;
    rmSync(backup.path, { force: true });
    rmSync(`${backup.path}.json`, { force: true });
    log(`Se borró el respaldo antiguo ${name} (fuera de la retención).`);
  }
  return remove.length;
}

/** Copia con verificación de la huella; devuelve el destino. */
async function copyVerified(source, targetDir, relative, sha256) {
  const target = path.join(targetDir, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.partial`;
  copyFileSync(source, temp);
  if ((await sha256Of(temp)) !== sha256) {
    rmSync(temp, { force: true });
    throw new BackupError('La copia no coincide con el original (huella distinta).');
  }
  renameSync(temp, target);
  copyFileSync(`${source}.json`, `${target}.json`);
  return target;
}

// ---------------------------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------------------------

/**
 * Crea un respaldo. `prune: false` no borra respaldos antiguos: lo usa la restauración, que nunca
 * debe borrar el archivo que se va a restaurar (la retención guarda solo el último de cada día).
 * Devuelve la ruta del respaldo creado.
 */
async function run(config, { prune: shouldPrune = true } = {}) {
  openLog(config.dir);
  const container = resolveContainer(config);
  const now = new Date();
  const encrypted = Boolean(config.passphrase);
  if (encrypted && config.passphrase.length < 12) {
    throw new BackupError('BACKUP_PASSPHRASE debe tener al menos 12 caracteres.');
  }
  const name = backupFileName(now, encrypted);
  const relative = path.join(monthFolder(now), name);
  const finalPath = path.join(config.dir, relative);
  mkdirSync(path.dirname(finalPath), { recursive: true });
  const plain = path.join(config.dir, `.${backupFileName(now, false)}.partial`);

  log(`Respaldo de «${config.dbName}» → ${finalPath}`);
  try {
    const before = countRows(container, config, config.dbName);
    await dumpTo(container, config, plain);
    const after = countRows(container, config, config.dbName);
    // El archivo debe poder leerse: su tabla de contenido no puede estar vacía.
    const toc = await execWithFileInput(container, ['pg_restore', '--list'], plain);
    if (!/TABLE DATA/.test(toc)) throw new BackupError('El respaldo no contiene datos de tablas.');

    if (encrypted) {
      await encryptFile(plain, finalPath, config.passphrase);
      rmSync(plain, { force: true });
    } else {
      renameSync(plain, finalPath);
    }
    const sha256 = await sha256Of(finalPath);
    const bytes = statSync(finalPath).size;
    writeFileSync(
      `${finalPath}.json`,
      JSON.stringify(
        {
          createdAt: now.toISOString(),
          database: config.dbName,
          file: name,
          bytes,
          sha256,
          encrypted,
          countsBefore: before,
          countsAfter: after,
        },
        null,
        2,
      ),
    );
    log(
      `Respaldo listo: ${formatSize(bytes)}, huella ${sha256.slice(0, 16)}… ${encrypted ? '(cifrado)' : ''}`,
    );
    log(
      `Cifras: ${Object.entries(after)
        .map(([table, count]) => `${table}=${count ?? '–'}`)
        .join(' ')}`,
    );
    if (shouldPrune) {
      prune(config.dir, { keepDaily: config.keepDaily, keepMonthly: config.keepMonthly });
    }

    if (config.extraDir) {
      try {
        await copyVerified(finalPath, config.extraDir, relative, sha256);
        log(`Segunda copia verificada en ${config.extraDir}`);
        if (shouldPrune) {
          prune(config.extraDir, {
            keepDaily: config.extraKeepDaily,
            keepMonthly: config.extraKeepMonthly,
          });
        }
      } catch (error) {
        log(`⚠ Falló la segunda copia en ${config.extraDir}: ${error.message}`);
        process.exitCode = 2;
      }
    } else {
      log('Sin segunda copia (BACKUP_EXTRA_DIR no está definida).');
    }
    return finalPath;
  } finally {
    rmSync(plain, { force: true });
  }
}

/**
 * Archivo plano para restaurar: si está cifrado, un temporal descifrado; si no, el mismo archivo o,
 * con `copy`, una copia temporal (así nada puede borrarlo mientras se usa).
 */
async function plainFileOf(file, config, { copy = false } = {}) {
  if (!file.endsWith('.enc')) {
    if (!copy) return { path: file, cleanup: () => undefined };
    const temp = path.join(os.tmpdir(), `joyeria-restaurar-${Date.now()}.dump`);
    copyFileSync(file, temp);
    return { path: temp, cleanup: () => rmSync(temp, { force: true }) };
  }
  if (!config.passphrase) {
    throw new BackupError('El respaldo está cifrado: defina BACKUP_PASSPHRASE con su frase.');
  }
  const temp = path.join(os.tmpdir(), `joyeria-descifrado-${Date.now()}.dump`);
  try {
    await decryptFile(file, temp, config.passphrase);
  } catch (error) {
    rmSync(temp, { force: true });
    throw new BackupError(error instanceof Error ? error.message : String(error));
  }
  return { path: temp, cleanup: () => rmSync(temp, { force: true }) };
}

function pickFile(config) {
  const given = positional[0];
  if (given) {
    if (!existsSync(given)) throw new BackupError(`No existe el archivo ${given}`);
    return path.resolve(given);
  }
  const latest = listBackups(config.dir).at(-1);
  if (!latest) throw new BackupError(`No hay respaldos en ${config.dir}`);
  return latest.path;
}

async function verify(config) {
  openLog(config.dir);
  const container = resolveContainer(config);
  const file = pickFile(config);
  const manifest = existsSync(`${file}.json`)
    ? JSON.parse(readFileSync(`${file}.json`, 'utf8'))
    : null;
  if (manifest && (await sha256Of(file)) !== manifest.sha256) {
    throw new BackupError('La huella del archivo no coincide con su manifiesto: está dañado.');
  }
  const plain = await plainFileOf(file, config);
  const temp = `joyeria_verificacion_${Date.now()}`;
  if (temp === config.dbName) throw new BackupError('Nombre de base temporal inválido.');
  log(`Verificando ${path.basename(file)} en la base temporal «${temp}»…`);
  exec(container, ['psql', '-U', config.dbUser, '-d', 'postgres', '-c', `CREATE DATABASE ${temp}`]);
  try {
    await execWithFileInput(
      container,
      ['pg_restore', '-U', config.dbUser, '-d', temp, '--no-owner', '--exit-on-error'],
      plain.path,
    );
    const restored = countRows(container, config, temp);
    let ok = true;
    for (const table of COUNT_TABLES) {
      const low = manifest?.countsBefore?.[table];
      const high = manifest?.countsAfter?.[table];
      const value = restored[table];
      // Sin cifra (tabla inexistente o manifiesto antiguo) no se puede comparar: no cuenta como error.
      const known = (count) => count !== null && count !== undefined;
      const inRange =
        !known(low) || !known(high) || !known(value) || (value >= low && value <= high);
      if (!inRange) ok = false;
      log(
        `  ${table.padEnd(22)} restaurado=${String(value ?? '–').padStart(7)}  esperado=${low ?? '–'}–${high ?? '–'} ${inRange ? 'OK' : 'NO COINCIDE'}`,
      );
    }
    if (!ok) throw new BackupError('Las cifras restauradas no coinciden con las del respaldo.');
    log('✔ El respaldo se restauró completo y sus cifras coinciden.');
  } finally {
    exec(
      container,
      [
        'psql',
        '-U',
        config.dbUser,
        '-d',
        'postgres',
        '-c',
        `DROP DATABASE IF EXISTS ${temp} WITH (FORCE)`,
      ],
      { allowFail: true },
    );
    plain.cleanup();
  }
}

async function restore(config) {
  if (flags.get('yes') !== 'true') {
    throw new BackupError(
      'Restaurar REEMPLAZA la base de datos actual por el respaldo. Confirme con --yes ' +
        '(antes se hace una copia de seguridad de lo que hay ahora).',
    );
  }
  if (!positional[0]) throw new BackupError('Indique el archivo a restaurar.');
  const file = pickFile(config);
  const container = resolveContainer(config);
  // 1. El archivo a restaurar se prepara y se valida ANTES de tocar nada: si está dañado o la frase
  //    es incorrecta, la base actual queda intacta.
  const plain = await plainFileOf(file, config, { copy: true });
  let safety;
  try {
    const toc = await execWithFileInput(container, ['pg_restore', '--list'], plain.path);
    if (!/TABLE DATA/.test(toc)) throw new BackupError('El archivo no contiene datos de tablas.');
    // 2. Respaldo de lo que hay ahora, SIN borrar respaldos antiguos.
    log('Copia de seguridad previa de la base actual…');
    safety = await run(config, { prune: false });
  } catch (error) {
    plain.cleanup();
    throw error;
  }
  const appService = flags.get('app') ?? 'app';
  const compose = ['compose', '-p', config.project];
  log('Deteniendo la aplicación…');
  dockerSync([...compose, 'stop', appService], { cwd: ROOT });
  try {
    exec(container, [
      'psql',
      '-U',
      config.dbUser,
      '-d',
      'postgres',
      '-c',
      `DROP DATABASE IF EXISTS ${config.dbName} WITH (FORCE)`,
    ]);
    exec(container, [
      'psql',
      '-U',
      config.dbUser,
      '-d',
      'postgres',
      '-c',
      `CREATE DATABASE ${config.dbName}`,
    ]);
    await execWithFileInput(
      container,
      ['pg_restore', '-U', config.dbUser, '-d', config.dbName, '--no-owner', '--exit-on-error'],
      plain.path,
    );
    log(`✔ Base «${config.dbName}» restaurada desde ${path.basename(file)}.`);
  } catch (error) {
    log(`✖ La restauración falló. La copia previa de la base está en ${safety}`);
    throw error;
  } finally {
    plain.cleanup();
    log('Iniciando la aplicación…');
    dockerSync([...compose, 'start', appService], { cwd: ROOT });
  }
}

function status(config) {
  const lines = [];
  const backups = listBackups(config.dir);
  lines.push(
    `Carpeta de respaldos: ${config.dir}${existsSync(config.dir) ? '' : '  (todavía no existe)'}`,
  );
  const last = backups.at(-1);
  if (last) {
    const hours = Math.round((Date.now() - last.date.getTime()) / 36e5);
    lines.push(
      `Último respaldo: ${last.name} (${formatSize(last.bytes)}), hace ${hours} h${hours > 30 ? '  ⚠ MÁS DE UN DÍA' : ''}`,
    );
  } else {
    lines.push('Último respaldo: ninguno  ⚠');
  }
  lines.push(`Respaldos guardados: ${backups.length}`);
  lines.push(
    config.extraDir
      ? `Segunda copia: ${config.extraDir}${existsSync(config.extraDir) ? ` (${listBackups(config.extraDir).length} respaldos)` : '  ⚠ la carpeta no existe'}`
      : 'Segunda copia: no configurada (BACKUP_EXTRA_DIR)',
  );
  lines.push(`Cifrado: ${config.passphrase ? 'sí' : 'no'}`);
  if (process.platform === 'win32') {
    const task = spawnSync('schtasks', ['/Query', '/TN', TASK_NAME, '/FO', 'LIST'], {
      encoding: 'utf8',
    });
    lines.push(
      task.status === 0
        ? `Tarea diaria: programada («${TASK_NAME}»)`
        : 'Tarea diaria: NO programada  ⚠ (npm run backup:schedule)',
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;

function schedule() {
  if (process.platform !== 'win32') {
    throw new BackupError(
      'La programación automática está hecha para Windows (Programador de tareas).',
    );
  }
  const at = flags.get('at') ?? '20:30';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at))
    throw new BackupError('Use --at=HH:MM, por ejemplo --at=20:30');
  const script = [
    `$action = New-ScheduledTaskAction -Execute ${psQuote(process.execPath)} -Argument ${psQuote(`"${path.join(ROOT, 'scripts', 'backup.mjs')}" run`)} -WorkingDirectory ${psQuote(ROOT)}`,
    `$trigger = New-ScheduledTaskTrigger -Daily -At ${psQuote(at)}`,
    '$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) -ExecutionTimeLimit (New-TimeSpan -Hours 1)',
    `Register-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Action $action -Trigger $trigger -Settings $settings -Description 'Respaldo diario de la base de datos de Joyería Sole' -Force | Out-Null`,
  ].join('; ');
  // `--dry-run` muestra lo que se registraría sin tocar el Programador de tareas.
  if (flags.get('dry-run') === 'true') {
    process.stdout.write(`${script.replaceAll('; ', ';\n')}\n`);
    return;
  }
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new BackupError(
      `No se pudo programar la tarea: ${(result.stderr ?? '').trim().slice(0, 400)}`,
    );
  }
  log(
    `✔ Tarea «${TASK_NAME}» programada todos los días a las ${at}. Si la PC está apagada a esa hora, se ejecuta al encenderla.`,
  );
  log('Requisito: Docker Desktop debe estar abierto (configúrelo para iniciar con Windows).');
}

function unschedule() {
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Unregister-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Confirm:$false`,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new BackupError('No había una tarea programada o no se pudo quitar.');
  log(`Tarea «${TASK_NAME}» quitada.`);
}

function help() {
  process.stdout.write(
    [
      'Respaldo de Joyería Sole',
      '  npm run backup                       crea un respaldo ahora',
      '  npm run backup:status                estado de los respaldos y de la tarea diaria',
      '  npm run backup:verify [archivo]      restaura en una base temporal y compara cifras',
      '  npm run backup:schedule [-- --at=HH:MM]   programa el respaldo diario (Windows)',
      '  npm run backup:unschedule            quita la tarea programada',
      '  npm run backup:restore -- <archivo> --yes   devuelve el sistema a ese respaldo',
      '',
    ].join('\n'),
  );
}

try {
  const config = loadConfig();
  if (command === 'run') await run(config);
  else if (command === 'verify') await verify(config);
  else if (command === 'restore') await restore(config);
  else if (command === 'status') status(config);
  else if (command === 'schedule') schedule();
  else if (command === 'unschedule') unschedule();
  else help();
} catch (error) {
  const message =
    error instanceof BackupError ? error.message : `Error inesperado: ${error?.stack ?? error}`;
  log(`✖ ${message}`);
  process.exitCode = 1;
}

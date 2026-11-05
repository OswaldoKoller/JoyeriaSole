// PostgreSQL efímero, exclusivo de esta ejecución. No carga el .env del proyecto.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

const mode = process.argv[2] ?? 'all';
if (!['all', 'check', 'api', 'e2e'].includes(mode))
  throw new Error('Modo permitido: all, check, api o e2e');
const specFilters = process.argv.slice(3);
if (
  specFilters.length &&
  ((mode === 'e2e' && specFilters.some((spec) => !/^[a-z0-9-]+\.spec\.ts$/.test(spec))) ||
    (mode === 'api' && specFilters.some((spec) => !/^[a-z0-9-]+\.test\.ts$/.test(spec))) ||
    (mode !== 'e2e' && mode !== 'api'))
) {
  throw new Error('Filtro permitido: archivos *.spec.ts para E2E o *.test.ts para API');
}
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Ejecutar mediante npm run qa o npm run qa:e2e');

function docker(args, env = process.env) {
  const result = spawnSync('docker', args, { env, encoding: 'utf8', timeout: 120_000 });
  if (result.error || result.status !== 0) {
    // No volcar argumentos ni entorno: pueden incluir credenciales efímeras.
    throw new Error(
      `Docker falló en ${args[0]}. Comprobar Docker Desktop e imagen postgres:18-alpine.`,
    );
  }
  return result.stdout.trim();
}

function npm(args, env) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { env, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Falló npm ${args.join(' ')}`);
}

let container;
try {
  docker(['info', '--format', '{{.ServerVersion}}']);
  const password = randomBytes(24).toString('hex');
  container = docker(
    [
      'run',
      '--detach',
      '--rm',
      '--label',
      'joyeria.qa=ephemeral',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD',
      '--env',
      'POSTGRES_USER=joyeria',
      '--env',
      'POSTGRES_DB=joyeria_test',
      'postgres:18-alpine',
    ],
    { ...process.env, POSTGRES_PASSWORD: password },
  );
  if (!/^[a-f0-9]{64}$/.test(container)) throw new Error('Identidad de contenedor no válida');
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', 'joyeria', '-d', 'joyeria_test'],
      { stdio: 'ignore', timeout: 5000 },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    await setTimeout(1000);
  }
  if (!ready) throw new Error('PostgreSQL no quedó listo en el plazo esperado');
  const mapping = docker(['port', container, '5432/tcp']);
  const port = /^127\.0\.0\.1:(\d+)$/.exec(mapping)?.[1];
  if (!port) throw new Error('El puerto de QA debe estar ligado solo a localhost');
  const url = `postgresql://joyeria:${password}@127.0.0.1:${port}/joyeria_test?schema=public`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SESSION_TTL_HOURS: '3',
    DATABASE_URL: url,
    TEST_DATABASE_URL: url,
    AUTH_SECRET: randomBytes(48).toString('hex'),
    SEED_ADMIN_EMAIL: 'qa-admin@example.invalid',
    SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
    SEED_ADMIN_NAME: 'Administrador de pruebas',
    DEMO_USER_PASSWORD: randomBytes(24).toString('hex'),
    COOKIE_SECURE: 'false',
    TRUST_PROXY: 'false',
    WEB_DIST_DIR: '',
  };
  npm(['run', 'db:generate'], env);
  if (mode === 'all' || mode === 'check') npm(['run', 'check'], env);
  if (mode === 'api')
    npm(
      ['run', 'test', '-w', '@joyeria/api', ...(specFilters.length ? ['--', ...specFilters] : [])],
      env,
    );
  if (mode === 'all' || mode === 'e2e') {
    npm(['run', 'db:deploy'], env);
    npm(['run', 'db:seed'], env);
    npm(['run', 'db:seed:demo'], env);
    npm(['run', 'test:e2e', ...(specFilters.length ? ['--', ...specFilters] : [])], env);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falló la verificación');
  process.exitCode = 1;
} finally {
  if (container && /^[a-f0-9]{64}$/.test(container)) {
    // Solo el contenedor creado aquí; --rm elimina sus volúmenes anónimos.
    try {
      docker(['stop', '--time', '5', container]);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

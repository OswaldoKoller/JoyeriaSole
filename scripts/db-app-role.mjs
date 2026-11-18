// Usuario de PostgreSQL de la APLICACIÓN en la instalación local (PC de la tienda, decisión D3).
//
// El contenedor de PostgreSQL crea POSTGRES_USER como superusuario, y un superusuario no pasa por la
// comprobación de permisos: con él, quitar TRUNCATE (prisma/privileges/revoke-app-truncate.sql) no
// protege nada. Por eso la aplicación, sus migraciones y la siembra se conectan con un usuario propio
// SIN superusuario (`APP_DB_USER`, por defecto «joyeria_app»), dueño de la base y de sus tablas, al que
// se le quita TRUNCATE. El superusuario queda solo para administrar (crear este usuario, respaldos).
//
// Este módulo es PURO (sin Docker ni red): arma el SQL que ejecutan, como superusuario,
// `scripts/local-deploy.mjs` (al levantar) y `scripts/backup.mjs` (después de restaurar). Lo prueba
// `apps/api/test/unit/db-app-role.test.ts`; el SQL se prueba contra PostgreSQL real en
// `apps/api/test/integration/db-app-role.test.ts`.

import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/** Usuario de la aplicación cuando `.env` no define `APP_DB_USER`. */
export const DEFAULT_APP_DB_USER = 'joyeria_app';

const ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
// Solo caracteres que no necesitan comillas en SQL ni codificación en una URL de conexión.
const SECRET_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const VERIFIER_PATTERN = /^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;
const SCRAM_ITERATIONS = 4096;

/**
 * Valida el nombre del usuario de la aplicación. Debe ser distinto del superusuario: si fueran el
 * mismo, la aplicación seguiría conectándose como superusuario.
 */
export function assertAppRole(role, superuser) {
  if (typeof role !== 'string' || !ROLE_PATTERN.test(role)) {
    throw new Error(
      `APP_DB_USER «${String(role)}» no es válido: use minúsculas, números y «_» (p. ej. ${DEFAULT_APP_DB_USER}).`,
    );
  }
  if (role === superuser) {
    throw new Error(
      `APP_DB_USER no puede ser el mismo usuario que POSTGRES_USER («${superuser}»), que es superusuario.`,
    );
  }
  return role;
}

/** Valida la contraseña del usuario de la aplicación (nunca la incluye en el mensaje). */
export function assertAppPassword(password) {
  if (typeof password !== 'string' || !SECRET_PATTERN.test(password)) {
    throw new Error(
      'APP_DB_PASSWORD no es válida: de 16 a 128 caracteres, solo letras, números, «-» y «_».',
    );
  }
  return password;
}

/** URL de conexión del usuario de la aplicación (valores ya validados: no necesitan codificarse). */
export function appDatabaseUrl({ role, password, host, port, database }) {
  return `postgresql://${role}:${password}@${host}:${port}/${database}?schema=public`;
}

/**
 * Verificador SCRAM-SHA-256 de una contraseña, en el formato que guarda PostgreSQL
 * (`SCRAM-SHA-256$<iteraciones>:<sal>$<StoredKey>:<ServerKey>`, RFC 5802/7677). Se envía ya cifrada
 * para que la contraseña en claro no viaje a `psql` ni quede en el registro del servidor si una
 * sentencia falla. La contraseña es ASCII (ver {@link assertAppPassword}), así que SASLprep no la cambia.
 */
export function scramVerifier(
  password,
  { salt = randomBytes(16), iterations = SCRAM_ITERATIONS } = {},
) {
  assertAppPassword(password);
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/**
 * Crea el usuario de la aplicación si no existe y fija sus atributos y su contraseña (como
 * verificador SCRAM, ver {@link scramVerifier}). Idempotente: en cada arranque deja el usuario SIN
 * superusuario y con la contraseña de `.env`. Una sola sentencia (bloque DO).
 */
export function appRoleSql({ role, verifier }) {
  assertAppRole(role);
  if (typeof verifier !== 'string' || !VERIFIER_PATTERN.test(verifier)) {
    throw new Error('El verificador de la contraseña no tiene el formato SCRAM-SHA-256.');
  }
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE "${role}" LOGIN;
  END IF;
  ALTER ROLE "${role}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD '${verifier}';
END $$;
`;
}

/**
 * Deja la base ACTUAL a nombre del usuario de la aplicación y le quita TRUNCATE (D3). Lo ejecuta un
 * superusuario conectado a esa base. Idempotente: solo toca lo que todavía no le pertenece, así sirve
 * para una instalación nueva (base vacía), para una que ya tenía datos a nombre del superusuario y
 * después de restaurar un respaldo (que se guarda sin dueños ni permisos).
 *
 *   1. La base y el esquema public (en PostgreSQL 15+ public pertenece a «pg_database_owner», que es
 *      el dueño de la base: ya queda cubierto).
 *   2. Tablas y vistas de public (sus índices y las secuencias de sus columnas cambian con ellas).
 *   3. Secuencias sueltas, funciones (los triggers) y tipos (enums) de public.
 *      Los objetos de extensiones (pg_trgm) no se tocan: siguen siendo del superusuario.
 *   4. Revoca TRUNCATE en todas sus tablas y en sus privilegios por defecto (lo mismo que hace
 *      prisma/privileges/revoke-app-truncate.sql en cada arranque de la imagen). Un superusuario que
 *      ejecuta REVOKE lo hace en nombre del dueño de la tabla.
 *
 * Es una sola sentencia (bloque DO) para poder probarla dentro de una transacción que se revierte.
 */
export function appOwnershipSql({ role }) {
  assertAppRole(role);
  return `DO $$
DECLARE
  app_role constant text := '${role}';
  app_oid oid;
  obj record;
BEGIN
  SELECT oid INTO app_oid FROM pg_roles WHERE rolname = app_role;
  IF app_oid IS NULL THEN
    RAISE EXCEPTION 'No existe el usuario de la aplicación «%».', app_role;
  END IF;
  IF (SELECT rolsuper FROM pg_roles WHERE oid = app_oid) THEN
    RAISE EXCEPTION 'El usuario «%» es superusuario: no sirve para proteger el libro (D3).', app_role;
  END IF;

  -- 1. La base y el esquema public.
  IF (SELECT datdba FROM pg_database WHERE datname = current_database()) <> app_oid THEN
    EXECUTE format('ALTER DATABASE %I OWNER TO %I', current_database(), app_role);
  END IF;
  IF (SELECT nspowner FROM pg_namespace WHERE nspname = 'public')
     NOT IN (app_oid, 'pg_database_owner'::regrole::oid) THEN
    EXECUTE format('ALTER SCHEMA public OWNER TO %I', app_role);
  END IF;

  -- 2. Tablas y vistas.
  FOR obj IN
    SELECT c.oid::regclass AS name, c.relkind FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND c.relowner <> app_oid
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO %I',
      CASE obj.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                       WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
      obj.name, app_role);
  END LOOP;

  -- 3a. Secuencias que no pertenecen a una columna.
  FOR obj IN
    SELECT c.oid::regclass AS name FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' AND c.relowner <> app_oid
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                        AND d.deptype IN ('a', 'i', 'e'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO %I', obj.name, app_role);
  END LOOP;

  -- 3b. Funciones y procedimientos (las funciones de los triggers).
  FOR obj IN
    SELECT p.oid::regprocedure AS name, p.prokind FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proowner <> app_oid
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO %I',
      CASE obj.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
      obj.name, app_role);
  END LOOP;

  -- 3c. Tipos: enums, dominios, rangos y tipos compuestos sueltos (los de las tablas ya cambiaron).
  FOR obj IN
    SELECT t.oid::regtype AS name, t.typtype FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace AND t.typowner <> app_oid
      AND t.typtype IN ('e', 'd', 'r', 'c')
      AND (t.typtype <> 'c' OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO %I',
      CASE obj.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, obj.name, app_role);
  END LOOP;

  -- 4. Sin TRUNCATE (D3).
  FOR obj IN
    SELECT c.oid::regclass AS name FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relowner = app_oid
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM %I', obj.name, app_role);
  END LOOP;
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE TRUNCATE ON TABLES FROM %I',
                 app_role, app_role);
END $$;
`;
}

/**
 * Consulta de estado de la protección, para mostrarla al levantar y en `local:status`. Devuelve una
 * fila `superusuario|dueño_de_la_base|tablas|tablas_ajenas|tablas_con_truncate`, o nada si el usuario
 * no existe.
 */
export function protectionStatusSql({ role }) {
  assertAppRole(role);
  return `SELECT r.rolsuper AS superuser,
  (SELECT d.datdba = r.oid FROM pg_database d WHERE d.datname = current_database()) AS owns_database,
  count(c.oid) AS tables,
  count(c.oid) FILTER (WHERE c.relowner <> r.oid) AS not_owned,
  count(c.oid) FILTER (WHERE has_table_privilege(r.oid, c.oid, 'TRUNCATE')) AS with_truncate
FROM pg_roles r
LEFT JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
WHERE r.rolname = '${role}'
GROUP BY r.oid, r.rolsuper;`;
}

/**
 * Interpreta la salida de `psql -At -F '|'` de {@link protectionStatusSql}.
 * `active` solo si el usuario no es superusuario, es dueño de la base y de todas las tablas, hay
 * tablas y ninguna conserva TRUNCATE. `reasons` explica, en español, por qué no lo está.
 */
export function parseProtectionStatus(output) {
  const line = String(output ?? '')
    .split(/\r?\n/)
    .map((text) => text.trim())
    .find((text) => text.includes('|'));
  if (!line) return { active: false, reasons: ['el usuario de la aplicación no existe'] };
  const [superuser, ownsDatabase, tables, notOwned, withTruncate] = line.split('|');
  const status = {
    superuser: superuser === 't',
    ownsDatabase: ownsDatabase === 't',
    tables: Number(tables),
    notOwned: Number(notOwned),
    withTruncate: Number(withTruncate),
  };
  const reasons = [];
  if (status.superuser) reasons.push('el usuario de la aplicación es superusuario');
  if (!status.ownsDatabase) reasons.push('la base no pertenece al usuario de la aplicación');
  if (!(status.tables > 0)) reasons.push('la base todavía no tiene tablas');
  if (status.notOwned > 0) reasons.push(`${status.notOwned} tablas pertenecen a otro usuario`);
  if (status.withTruncate > 0) reasons.push(`${status.withTruncate} tablas conservan TRUNCATE`);
  return { ...status, active: reasons.length === 0, reasons };
}

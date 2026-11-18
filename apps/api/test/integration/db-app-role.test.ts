/**
 * D3 en la instalación local (PC de la tienda): el SQL de `scripts/db-app-role.mjs` contra PostgreSQL
 * real. Parte de una base con todas las migraciones aplicadas a nombre del superusuario (como una
 * instalación anterior o una base recién restaurada) y comprueba que el usuario de la aplicación queda
 * dueño de todo, sin superusuario y sin TRUNCATE, y que puede seguir migrando y operando.
 *
 * Todo ocurre dentro de una transacción que se revierte: la base de pruebas conserva su dueño y
 * TRUNCATE para resetDatabase.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.ts';
import { createPrismaClient, type PrismaClient } from '../../src/lib/prisma.ts';
import { testDatabaseUrl } from '../helpers/test-env.ts';
import {
  appOwnershipSql,
  appRoleSql,
  parseProtectionStatus,
  protectionStatusSql,
  scramVerifier,
} from '../../../../scripts/db-app-role.mjs';

// Cambiar el dueño de todas las tablas toma su tiempo en una máquina lenta.
vi.setConfig({ testTimeout: 120_000 });

class Rollback extends Error {}

interface StatusRow {
  superuser: boolean;
  owns_database: boolean | null;
  tables: bigint;
  not_owned: bigint;
  with_truncate: bigint;
}

async function protection(tx: Prisma.TransactionClient, role: string) {
  const [row] = await tx.$queryRawUnsafe<StatusRow[]>(protectionStatusSql({ role }));
  if (!row) return parseProtectionStatus('');
  const flag = (value: boolean | null) => (value ? 't' : 'f');
  return parseProtectionStatus(
    [
      flag(row.superuser),
      flag(row.owns_database),
      row.tables,
      row.not_owned,
      row.with_truncate,
    ].join('|'),
  );
}

async function privilege(tx: Prisma.TransactionClient, table: string, kind: string) {
  const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
    SELECT has_table_privilege(current_user, ${table}::text, ${kind}::text) AS ok`;
  return row?.ok;
}

async function storedPassword(tx: Prisma.TransactionClient, role: string) {
  const [row] = await tx.$queryRaw<{ password: string | null }[]>`
    SELECT rolpassword AS password FROM pg_authid WHERE rolname = ${role}`;
  return row?.password ?? '';
}

describe('D3 · usuario de la aplicación de la instalación local (scripts/db-app-role.mjs)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(testDatabaseUrl());
  });
  afterAll(() => prisma.$disconnect());

  it('traspasa la base al usuario de la aplicación, le quita TRUNCATE y es idempotente', async () => {
    const role = `app_${randomBytes(6).toString('hex')}`;
    const password = randomBytes(24).toString('hex');

    const outcome = await prisma
      .$transaction(
        async (tx) => {
          // 1. El verificador SCRAM que calcula el script es el mismo que calcula PostgreSQL.
          await tx.$executeRawUnsafe(appRoleSql({ role, verifier: scramVerifier(password) }));
          await tx.$executeRawUnsafe(`SET LOCAL password_encryption = 'scram-sha-256'`);
          await tx.$executeRawUnsafe(`ALTER ROLE "${role}" PASSWORD '${password}'`);
          const computed = await storedPassword(tx, role);
          const match = /^SCRAM-SHA-256\$(\d+):([^$]+)\$/.exec(computed);
          expect(match).not.toBeNull();
          const ours = scramVerifier(password, {
            salt: Buffer.from(match?.[2] ?? '', 'base64'),
            iterations: Number(match?.[1]),
          });
          expect(ours).toBe(computed);

          // 2. Usuario creado, pero la base sigue a nombre del superusuario: protección inactiva.
          const verifier = scramVerifier(password);
          await tx.$executeRawUnsafe(appRoleSql({ role, verifier }));
          expect(await storedPassword(tx, role)).toBe(verifier);
          const before = await protection(tx, role);
          expect(before.active).toBe(false);
          expect(before.reasons).toContain('la base no pertenece al usuario de la aplicación');

          // 3. Traspaso (dos veces: es idempotente) y repetición de la creación del usuario.
          await tx.$executeRawUnsafe(appOwnershipSql({ role }));
          await tx.$executeRawUnsafe(appOwnershipSql({ role }));
          await tx.$executeRawUnsafe(appRoleSql({ role, verifier }));

          const after = await protection(tx, role);
          expect(after).toMatchObject({ active: true, reasons: [], superuser: false });
          expect(after.tables).toBeGreaterThan(30);

          // Funciones (triggers), enums y secuencias de la aplicación son suyos; los objetos de la
          // extensión pg_trgm siguen siendo del superusuario.
          const [objects] = await tx.$queryRaw<
            {
              foreign_functions: number;
              foreign_enums: number;
              foreign_sequences: number;
              app_enums: number;
              extension_functions_moved: number;
            }[]
          >`
            WITH app AS (SELECT oid FROM pg_roles WHERE rolname = ${role})
            SELECT
              (SELECT count(*)::int FROM pg_proc p, app
                WHERE p.pronamespace = 'public'::regnamespace AND p.proowner <> app.oid
                  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                                    AND d.objid = p.oid AND d.deptype = 'e')) AS foreign_functions,
              (SELECT count(*)::int FROM pg_type t, app
                WHERE t.typnamespace = 'public'::regnamespace AND t.typtype = 'e'
                  AND t.typowner <> app.oid) AS foreign_enums,
              (SELECT count(*)::int FROM pg_type t
                WHERE t.typnamespace = 'public'::regnamespace AND t.typtype = 'e') AS app_enums,
              (SELECT count(*)::int FROM pg_class c, app
                WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
                  AND c.relowner <> app.oid) AS foreign_sequences,
              (SELECT count(*)::int FROM pg_proc p, app
                WHERE p.proowner = app.oid
                  AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                                AND d.objid = p.oid AND d.deptype = 'e')) AS extension_functions_moved`;
          expect(objects).toMatchObject({
            foreign_functions: 0,
            foreign_enums: 0,
            foreign_sequences: 0,
            extension_functions_moved: 0,
          });
          expect(objects?.app_enums).toBeGreaterThan(0);

          // 4. Como el usuario de la aplicación: opera y migra, pero no puede vaciar tablas.
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          for (const table of ['inventory_movements', 'audit_logs', 'sales', 'sale_exchanges']) {
            expect(await privilege(tx, table, 'TRUNCATE'), table).toBe(false);
            for (const kind of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
              expect(await privilege(tx, table, kind), `${table} ${kind}`).toBe(true);
            }
          }
          // Lo que hace una migración: tabla nueva (nace sin TRUNCATE), columna nueva y cambios en
          // una función de trigger (solo los puede hacer su dueño).
          await tx.$executeRawUnsafe('CREATE TABLE d3_probe (id integer)');
          expect(await privilege(tx, 'd3_probe', 'TRUNCATE')).toBe(false);
          expect(await privilege(tx, 'd3_probe', 'INSERT')).toBe(true);
          await tx.$executeRawUnsafe('ALTER TABLE audit_logs ADD COLUMN d3_probe integer');
          await tx.$executeRawUnsafe(
            `COMMENT ON FUNCTION prevent_append_only_change() IS 'prueba D3'`,
          );

          await tx.$executeRawUnsafe('SAVEPOINT before_truncate');
          await expect(tx.$executeRawUnsafe('TRUNCATE TABLE inventory_movements')).rejects.toThrow(
            /permission denied/i,
          );
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_truncate');
          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      )
      .catch((error: unknown) => error);
    if (!(outcome instanceof Rollback)) {
      throw outcome instanceof Error ? outcome : new Error(String(outcome));
    }

    // Todo se revirtió: el usuario temporal no existe y la base de pruebas sigue con su dueño.
    const [check] = await prisma.$queryRaw<{ roles: number; owner_is_me: boolean }[]>`
      SELECT (SELECT count(*)::int FROM pg_roles WHERE rolname = ${role}) AS roles,
             (SELECT datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                FROM pg_database WHERE datname = current_database()) AS owner_is_me`;
    expect(check).toEqual({ roles: 0, owner_is_me: true });
  });

  it('se niega a traspasar la base a un usuario inexistente o superusuario', async () => {
    await expect(
      prisma.$executeRawUnsafe(appOwnershipSql({ role: 'no_existe_d3' })),
    ).rejects.toThrow(/No existe el usuario/);
    const [me] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_user AS name`;
    await expect(
      prisma.$executeRawUnsafe(appOwnershipSql({ role: me?.name ?? '' })),
    ).rejects.toThrow(/superusuario/);
  });
});

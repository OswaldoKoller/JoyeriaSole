/**
 * Usuario de PostgreSQL de la aplicación en la instalación local (D3, `scripts/db-app-role.mjs`):
 * validaciones, verificador SCRAM y lectura del estado de la protección. El SQL se prueba contra
 * PostgreSQL real en `test/integration/db-app-role.test.ts`.
 */
import { describe, expect, it } from 'vitest';
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
} from '../../../../scripts/db-app-role.mjs';

const PASSWORD = 'a1b2c3d4e5f6a7b8c9d0e1f2';

describe('validaciones', () => {
  it('acepta el usuario por defecto y rechaza nombres que necesitarían comillas', () => {
    expect(assertAppRole(DEFAULT_APP_DB_USER, 'joyeria')).toBe('joyeria_app');
    for (const bad of [
      '',
      'Joyeria',
      'app-user',
      'app"; DROP',
      '1app',
      'a'.repeat(64),
      undefined,
    ]) {
      expect(() => assertAppRole(bad, 'joyeria'), String(bad)).toThrow(/APP_DB_USER/);
    }
  });

  it('rechaza usar el superusuario como usuario de la aplicación', () => {
    expect(() => assertAppRole('joyeria', 'joyeria')).toThrow(/superusuario/);
  });

  it('exige una contraseña larga sin caracteres especiales y nunca la muestra', () => {
    expect(assertAppPassword(PASSWORD)).toBe(PASSWORD);
    for (const bad of [
      'corta',
      "con'comilla-larga-123",
      'con espacio larga 123',
      'x'.repeat(129),
    ]) {
      let message = '';
      try {
        assertAppPassword(bad);
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }
      expect(message).toMatch(/APP_DB_PASSWORD/);
      expect(message).not.toContain(bad);
    }
  });
});

describe('verificador SCRAM-SHA-256', () => {
  it('es determinista con la misma sal y distinto con otra', () => {
    const salt = Buffer.alloc(16, 7);
    const first = scramVerifier(PASSWORD, { salt });
    expect(first).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(scramVerifier(PASSWORD, { salt })).toBe(first);
    expect(scramVerifier(PASSWORD)).not.toBe(first);
    expect(first).not.toContain(PASSWORD);
  });
});

describe('SQL generado', () => {
  const verifier = scramVerifier(PASSWORD, { salt: Buffer.alloc(16, 1) });

  it('crea el usuario sin superusuario y con la contraseña ya cifrada, en una sola sentencia', () => {
    const sql = appRoleSql({ role: 'joyeria_app', verifier });
    expect(sql).toContain('CREATE ROLE "joyeria_app" LOGIN');
    expect(sql).toMatch(/NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
    expect(sql).toContain(verifier);
    expect(sql).not.toContain(PASSWORD);
    expect(sql.trim().match(/^DO \$\$[\s\S]*END \$\$;$/)).not.toBeNull();
  });

  it('rechaza un verificador con otro formato (nada sin validar llega al SQL)', () => {
    expect(() => appRoleSql({ role: 'joyeria_app', verifier: PASSWORD })).toThrow(/SCRAM/);
    expect(() => appRoleSql({ role: 'joyeria_app', verifier: `${verifier}'` })).toThrow(/SCRAM/);
  });

  it('el traspaso de la base revoca TRUNCATE y no toca los objetos de extensiones', () => {
    const sql = appOwnershipSql({ role: 'joyeria_app' });
    expect(sql).toContain("app_role constant text := 'joyeria_app'");
    expect(sql).toContain('ALTER DATABASE %I OWNER TO %I');
    expect(sql).toContain('REVOKE TRUNCATE ON TABLE %s FROM %I');
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE TRUNCATE ON TABLES FROM %I');
    expect(sql).toContain("d.deptype = 'e'");
    expect(() => appOwnershipSql({ role: 'x"; DROP TABLE y; --' })).toThrow(/APP_DB_USER/);
    expect(() => protectionStatusSql({ role: "x' OR '1'='1" })).toThrow(/APP_DB_USER/);
  });

  it('arma la URL de conexión del usuario de la aplicación', () => {
    expect(
      appDatabaseUrl({
        role: 'joyeria_app',
        password: PASSWORD,
        host: 'localhost',
        port: 5434,
        database: 'joyeria_dev',
      }),
    ).toBe(`postgresql://joyeria_app:${PASSWORD}@localhost:5434/joyeria_dev?schema=public`);
  });
});

describe('estado de la protección', () => {
  it('activa: sin superusuario, dueño de la base y de todas sus tablas, ninguna con TRUNCATE', () => {
    expect(parseProtectionStatus('f|t|52|0|0\n')).toMatchObject({
      active: true,
      reasons: [],
      tables: 52,
    });
  });

  it('explica por qué está inactiva', () => {
    expect(parseProtectionStatus('').reasons).toEqual(['el usuario de la aplicación no existe']);
    const status = parseProtectionStatus('t|f|52|3|52');
    expect(status.active).toBe(false);
    expect(status.reasons).toEqual([
      'el usuario de la aplicación es superusuario',
      'la base no pertenece al usuario de la aplicación',
      '3 tablas pertenecen a otro usuario',
      '52 tablas conservan TRUNCATE',
    ]);
    expect(parseProtectionStatus('f|t|0|0|0').reasons).toEqual(['la base todavía no tiene tablas']);
  });
});

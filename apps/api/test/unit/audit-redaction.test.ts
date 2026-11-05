import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  isSensitiveKey,
  redactSensitive,
  type JsonValue,
} from '../../src/modules/audit/audit-redaction.ts';

describe('redacción de claves sensibles de la auditoría', () => {
  it('reconoce claves de contraseñas, tokens, secretos, cookies y autorización', () => {
    for (const key of [
      'password',
      'newPassword',
      'passwordHash',
      'tokenHash',
      'token',
      'sessionToken',
      'secret',
      'clientSecret',
      'cookie',
      'set-cookie',
      'Authorization',
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
    for (const key of ['name', 'email', 'price', 'quantity', 'roles']) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });

  it('oculta el valor de las claves sensibles y conserva el resto', () => {
    const input: JsonValue = { name: 'Ana', password: 'abc', nested: { tokenHash: 'h', ok: 1 } };
    expect(redactSensitive(input)).toEqual({
      name: 'Ana',
      password: REDACTED,
      nested: { tokenHash: REDACTED, ok: 1 },
    });
  });

  it('redacta recursivamente dentro de arreglos y objetos anidados', () => {
    const input: JsonValue = {
      items: [{ cookie: 'a=b', label: 'x' }, [{ Authorization: 'Bearer z' }]],
    };
    expect(redactSensitive(input)).toEqual({
      items: [{ cookie: REDACTED, label: 'x' }, [{ Authorization: REDACTED }]],
    });
  });

  it('también oculta objetos completos bajo una clave sensible', () => {
    expect(redactSensitive({ secret: { a: 1 } })).toEqual({ secret: REDACTED });
  });

  it('conserva null y booleanos (p. ej. mustChangePassword) y los valores primitivos', () => {
    expect(redactSensitive({ mustChangePassword: true, password: null, n: 3 })).toEqual({
      mustChangePassword: true,
      password: null,
      n: 3,
    });
    expect(redactSensitive('texto')).toBe('texto');
    expect(redactSensitive(null)).toBeNull();
  });

  it('no modifica la entrada original', () => {
    const input = { password: 'abc' };
    redactSensitive(input);
    expect(input.password).toBe('abc');
  });

  it('oculta el contenido demasiado profundo en vez de recorrerlo sin límite', () => {
    let deep: JsonValue = 'valor';
    for (let i = 0; i < 40; i += 1) deep = { child: deep };
    expect(JSON.stringify(redactSensitive(deep))).toContain(REDACTED);
  });
});

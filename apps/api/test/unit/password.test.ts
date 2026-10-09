import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.ts';
import { generateSessionToken, hashToken } from '../../src/lib/tokens.ts';

describe('contraseñas', () => {
  it('genera hashes argon2id con sal (nunca guarda la contraseña en claro)', async () => {
    const a = await hashPassword('una-clave-segura');
    const b = await hashPassword('una-clave-segura');
    expect(a).toMatch(/^\$argon2id\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('una-clave-segura');
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('una-clave-segura');
    expect(await verifyPassword(hash, 'una-clave-segura')).toBe(true);
    expect(await verifyPassword(hash, 'otra-clave')).toBe(false);
  });

  it('trata un hash corrupto como contraseña incorrecta en vez de fallar', async () => {
    expect(await verifyPassword('no-es-un-hash', 'x')).toBe(false);
  });
});

describe('tokens de sesión', () => {
  it('son aleatorios y se guardan como hash SHA-256', () => {
    const token = generateSessionToken();
    expect(token).not.toBe(generateSessionToken());
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });
});

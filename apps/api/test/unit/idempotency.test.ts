import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Prisma } from '../../src/generated/prisma/client.ts';
import {
  DEFAULT_IDEMPOTENCY_TTL_HOURS,
  canonicalJson,
  hashRequest,
  runIdempotent,
  toStoredJson,
} from '../../src/lib/idempotency.ts';

describe('JSON canónico y hash de la petición', () => {
  it('no depende del orden de las claves, en ningún nivel', () => {
    const a = { body: { b: 1, a: [{ y: 2, x: 1 }] }, params: { id: 'x' } };
    const b = { params: { id: 'x' }, body: { a: [{ x: 1, y: 2 }], b: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashRequest(a)).toBe(hashRequest(b));
  });

  it('ignora propiedades undefined y trata undefined/null en la raíz como null', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson([1, undefined])).toBe('[1,null]');
  });

  it('serializa fechas y bigint de forma estable', () => {
    expect(canonicalJson({ at: new Date('2026-11-10T12:00:00.000Z'), id: 10n })).toBe(
      '{"at":"2026-11-10T12:00:00.000Z","id":"10"}',
    );
  });

  it('distingue contenidos distintos (cantidad, tipo, orden de un arreglo)', () => {
    const base = hashRequest({ body: { items: [1, 2] } });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRequest({ body: { items: [2, 1] } })).not.toBe(base);
    expect(hashRequest({ body: { items: ['1', 2] } })).not.toBe(base);
    expect(hashRequest({ body: { items: [1, 2, 3] } })).not.toBe(base);
  });
});

describe('respuesta almacenable', () => {
  it('conserva la estructura JSON y convierte fechas y bigint a texto', () => {
    expect(
      toStoredJson({
        a: 'x',
        n: 1.5,
        ok: true,
        none: null,
        skip: undefined,
        list: [1, null, { at: new Date('2026-11-10T00:00:00.000Z') }],
        id: 7n,
      }),
    ).toEqual({
      a: 'x',
      n: 1.5,
      ok: true,
      none: null,
      list: [1, null, { at: '2026-11-10T00:00:00.000Z' }],
      id: '7',
    });
    expect(toStoredJson(null)).toBeNull();
  });

  it('rechaza valores que no son JSON (funciones, símbolos)', () => {
    expect(() => toStoredJson({ fn: () => 1 })).toThrow(TypeError);
  });
});

describe('runIdempotent sin clave', () => {
  it('ejecuta la operación tal cual y no toca la tabla de claves', async () => {
    const queryRaw = vi.fn();
    // Sin contexto el helper no usa la transacción: basta un objeto vacío.
    const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
    const result = await runIdempotent(tx, null, z.object({ ok: z.boolean() }), async () => ({
      ok: true,
    }));
    expect(result).toEqual({ ok: true });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('vigencia por defecto de 24 horas', () => {
    expect(DEFAULT_IDEMPOTENCY_TTL_HOURS).toBe(24);
  });
});

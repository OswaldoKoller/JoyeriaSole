import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.ts';
import { errorHandlerPlugin, isTransientDatabaseError } from '../../src/plugins/error-handler.ts';

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('detalle interno con SQL: SELECT secreto', {
    code,
    clientVersion: 'test',
    ...(meta && { meta }),
  });
}

async function respondWith(error: unknown) {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.get('/boom', async () => {
    throw error;
  });
  const response = await app.inject({ method: 'GET', url: '/boom' });
  await app.close();
  return response;
}

describe('errores transitorios de la base de datos', () => {
  it.each([
    ['P2034 (conflicto de escritura o deadlock)', prismaError('P2034')],
    ['P2028 (transacción sin tiempo o sin conexión)', prismaError('P2028')],
    ['P2010 con SQLSTATE 40P01 (deadlock)', prismaError('P2010', { code: '40P01' })],
    ['P2010 con SQLSTATE 40001 (serialización)', prismaError('P2010', { code: '40001' })],
    [
      'error del adaptador con conflicto de escritura',
      prismaError('P2010', {
        driverAdapterError: { cause: { kind: 'TransactionWriteConflict' } },
      }),
    ],
    [
      'error de pg con SQLSTATE 40P01',
      Object.assign(new Error('deadlock detected'), { code: '40P01' }),
    ],
  ])('%s responde 503 con Retry-After y sin detalles internos', async (_name, error) => {
    expect(isTransientDatabaseError(error)).toBe(true);
    const response = await respondWith(error);
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('2');
    const body = response.json();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.message).toMatch(/vuelva a intentarlo/);
    expect(JSON.stringify(body)).not.toMatch(/SELECT|secreto|P20\d\d|40P01/);
  });

  it('no confunde otros errores con transitorios', async () => {
    expect(isTransientDatabaseError(prismaError('P2002'))).toBe(false);
    expect(isTransientDatabaseError(new Error('x'))).toBe(false);
    expect(isTransientDatabaseError(null)).toBe(false);
    const unique = await respondWith(prismaError('P2002'));
    expect(unique.statusCode).toBe(409);
    expect(unique.headers['retry-after']).toBeUndefined();
    const unknown = await respondWith(new Error('fallo interno con detalles'));
    expect(unknown.statusCode).toBe(500);
    expect(unknown.json().error.message).not.toMatch(/detalles/);
  });
});

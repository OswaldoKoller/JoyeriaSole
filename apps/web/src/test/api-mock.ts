import { vi } from 'vitest';
import { jsonResponse } from './render.tsx';

export type ApiCall = {
  method: string;
  /** Ruta sin el prefijo `/api/v1` y con su consulta: `/cash/status`, `/sales?page=1`. */
  path: string;
  body: unknown;
  idempotencyKey: string | undefined;
};

/** Respuesta de un manejador: `[status, cuerpo]`, una `Response` o un error (fallo de red). */
type Reply = [number, unknown?] | Response | Error;
type Handler = (call: ApiCall, calls: ApiCall[]) => Reply | Promise<Reply>;

/**
 * Sustituye `fetch` por un enrutador de pruebas: `"MÉTODO /ruta"` → manejador. La ruta se compara
 * sin la consulta (`?…`). Registra cada llamada (con su `Idempotency-Key`) para las aserciones.
 * Una petición sin manejador falla la prueba con un mensaje claro. Las portadas de las piezas
 * (`PieceImage`) se responden solas, sin foto.
 */
export function mockApi(
  routes: Record<string, Handler>,
  user: { permissions: string[]; name?: string; id?: string },
) {
  const calls: ApiCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const path = url.replace(/^.*\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: ApiCall = { method, path, body, idempotencyKey: headers['Idempotency-Key'] };
    if (path === '/auth/me') {
      return jsonResponse(200, {
        data: {
          id: user.id ?? '01900000-0000-7000-8000-0000000000a1',
          name: user.name ?? 'Ana Cajera',
          email: 'ana@test.local',
          roles: [],
          permissions: user.permissions,
        },
      });
    }
    // Portadas de las piezas (PieceImage): sin foto, y no se registran como llamadas.
    if (path.startsWith('/products/variants/covers')) {
      const ids = new URLSearchParams(path.split('?')[1] ?? '').get('ids')?.split(',') ?? [];
      return jsonResponse(200, { data: ids.map((variantId) => ({ variantId, photo: null })) });
    }
    calls.push(call);
    const handler = routes[`${method} ${path.split('?')[0] ?? ''}`];
    if (!handler) throw new Error(`Petición inesperada: ${method} ${path}`);
    const reply = await handler(call, calls);
    if (reply instanceof Error) throw reply;
    if (reply instanceof Response) return reply;
    return jsonResponse(reply[0], reply[1]);
  });
  return calls;
}

/** Cuerpo de error estándar de la API. */
export function apiError(code: string, message: string, details?: unknown) {
  return { error: { code, message, details } };
}

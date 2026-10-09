---
name: api-development
description: Cómo implementar endpoints en la API Fastify de Joyería Sole — estructura de módulo, validación Zod, permisos, servicio con transacción y auditoría, errores y tests. Usar al crear o modificar rutas en apps/api.
---

# Desarrollo de API

Referencias: `docs/api/API.md`, módulo modelo `apps/api/src/modules/auth/`.

## Módulo modelo

```ts
// apps/api/src/modules/suppliers/suppliers.service.ts
import type { FastifyRequest } from 'fastify';
import { ConflictError, NotFoundError } from '../../lib/errors.ts';
import type { PrismaClient } from '../../lib/prisma.ts';
import { getAuth } from '../../plugins/auth.ts';
import { recordAudit } from '../audit/audit.service.ts';

export class SuppliersService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSupplierInput, request: FastifyRequest) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: input });
      await recordAudit(
        tx,
        {
          action: 'supplier.created',
          entityType: 'Supplier',
          entityId: supplier.id,
          after: supplier,
          userId: getAuth(request).user.id,
        },
        request,
      );
      return supplier;
    });
  }
}
```

```ts
// apps/api/src/modules/suppliers/suppliers.routes.ts
import { PERMISSIONS, createSupplierSchema } from '@joyeria/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SuppliersService } from './suppliers.service.ts';

const supplierResponse = z.object({ id: z.string(), name: z.string(), isActive: z.boolean() });

export const suppliersRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new SuppliersService(app.prisma);

  app.post(
    '/',
    {
      preHandler: app.requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
      schema: {
        body: createSupplierSchema,
        response: { 201: z.object({ data: supplierResponse }) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await service.create(request.body, request) }),
  );
};
```

Registrar en `src/app.ts`: `await api.register(suppliersRoutes, { prefix: '/suppliers' });`

## Reglas

- **Siempre** `preHandler: app.requirePermission(...)` (o `app.authenticate` si solo requiere sesión).
- **Siempre** esquema de `response`: es lo que impide filtrar campos (p. ej. `passwordHash`).
- Query params: `z.coerce.number()` para números; paginación `page` ≥ 1, `pageSize` ≤ 100.
- Decimales: en la respuesta, `z.string()` y convertir con `.toString()` (no perder precisión).
- Errores: lanzar `AppError` y subclases; el `error-handler` arma la respuesta. P2002 (único) → 409
  y P2025 (no encontrado) → 404 automáticamente.
- Operaciones compuestas en `prisma.$transaction(async (tx) => ...)`; auditoría con `tx`.
- Acciones de estado como sub-recurso: `POST /:id/confirm`. Sin `DELETE` para entidades con historial.
- Respuesta: `{ data }` / `{ data, meta: { page, pageSize, total } }`; `204` sin cuerpo para acciones sin resultado.

## Tests de integración (plantilla)

```ts
beforeAll(async () => { app = await buildTestApp(); });
beforeEach(() => resetDatabase(app.prisma));
afterAll(() => app.close());

it('401 sin sesión', ...);
it('403 sin permiso', async () => {
  const { user, password } = await createTestUser(app.prisma, { permissions: [PERMISSIONS.CATALOG_READ] });
  const { cookie } = await login(app, user.email, password);
  const res = await app.inject({ method: 'POST', url: '/api/v1/suppliers', headers: { cookie }, payload: {...} });
  expect(res.statusCode).toBe(403);
});
it('400 con datos inválidos', ...);
it('crea y audita', ...);
```

## Checklist

- [ ] Permiso correcto · [ ] Zod entrada y salida · [ ] Lógica en el servicio · [ ] Transacción
- [ ] Auditoría · [ ] Tests 401/403/400/feliz · [ ] `docs/api/API.md` · [ ] `requests.http` (opcional)

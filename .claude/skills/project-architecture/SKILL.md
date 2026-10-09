---
name: project-architecture
description: Arquitectura del sistema de inventario Joyería Sole — monorepo, capas, módulos, dónde va cada cosa y cómo agregar un módulo nuevo. Usar antes de crear archivos o módulos, o al evaluar un cambio estructural.
---

# Arquitectura del proyecto

Referencia completa: `docs/architecture/ARCHITECTURE.md` y ADRs en `docs/decisions/`.

## Mapa rápido — ¿dónde va esto?

| Necesito...                                     | Va en                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Un permiso nuevo                                | `packages/shared/src/permissions.ts` (+ `PERMISSION_DESCRIPTIONS`) y re-ejecutar `npm run db:seed` |
| Un esquema de validación usado por API **y** UI | `packages/shared/src/schemas/<area>.ts`, exportado en `index.ts`                                   |
| Un endpoint                                     | `apps/api/src/modules/<modulo>/<modulo>.routes.ts`                                                 |
| Una regla de negocio                            | `apps/api/src/modules/<modulo>/<modulo>.service.ts`                                                |
| Un error de negocio                             | Lanzar `BusinessRuleError` / `ConflictError` de `src/lib/errors.ts`                                |
| Algo transversal (hook, decorador)              | `apps/api/src/plugins/`                                                                            |
| Utilidad sin dominio                            | `apps/api/src/lib/`                                                                                |
| Tabla/columna                                   | `apps/api/prisma/schema.prisma` + migración (database-agent)                                       |
| Pantalla                                        | `apps/web/src/features/<area>/<nombre>-page.tsx` + ruta en `src/app/router.tsx`                    |
| Componente genérico                             | `apps/web/src/components/ui/`                                                                      |
| Decisión estructural                            | `docs/decisions/ADR-NNN-*.md`                                                                      |
| Decisión de negocio no definida                 | `docs/business/PENDIENTES.md`                                                                      |

## Capas del backend (no saltarlas)

```
routes (HTTP, Zod, permisos)  →  service (reglas, transacción, auditoría)  →  prisma
```

- Un servicio puede llamar a otro servicio; nunca escribir en tablas de otro módulo directamente.
- **Stock**: únicamente el servicio de inventario escribe `inventory_movements` e `inventory_balances`.

## Agregar un módulo de backend

1. `apps/api/src/modules/<m>/<m>.service.ts` — clase que recibe `PrismaClient` en el constructor.
2. `apps/api/src/modules/<m>/<m>.routes.ts` — `FastifyPluginAsyncZod`; instancia el servicio con `app.prisma`.
3. Registrar en `src/app.ts` dentro del bloque `/api/v1`: `await api.register(xRoutes, { prefix: '/x' })`.
4. Tests en `apps/api/test/integration/<m>.test.ts`.
5. Documentar endpoints en `docs/api/API.md`.

Ver la skill `api-development` para el código modelo.

## Principios

- Simplicidad primero; nada de abstracciones "por si acaso" (repositorios genéricos, CQRS, eventos).
- No inventar reglas: lo no definido se marca PENDIENTE.
- Preparar sin implementar: los módulos futuros (ventas, facturación, sucursales) no se codifican.

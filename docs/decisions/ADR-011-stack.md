# ADR-011: Stack y monolito modular

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Decisión

Monorepo con npm workspaces: `apps/api` (Fastify 5 + TypeScript + Prisma), `apps/web` (React 19 +
Vite + Tailwind 4 + TanStack Query + React Router) y `packages/shared` (permisos, errores, esquemas
Zod). El backend es un **monolito modular**: un módulo por área de negocio, cada uno con sus rutas y
su servicio. Justificación detallada en `docs/architecture/ARCHITECTURE.md`.

## Alternativas consideradas

- NestJS: estructura fuerte, pero más abstracción y ceremonia de la necesaria.
- Next.js full-stack: SSR innecesario; mezclar UI y API complica la API para futuros clientes (móvil).
- Microservicios: sobreingeniería para una pyme.

## Consecuencias

- Un solo lenguaje, tipos compartidos, un despliegue.
- `packages/shared` se consume como TypeScript fuente (Vite y tsx lo compilan; la API de producción lo
  empaqueta con tsup).

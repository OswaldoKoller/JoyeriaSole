# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado

- Preparación del entorno para la Fase 1 (2026-10-06):
  - Monorepo npm workspaces: `apps/api` (Fastify 5 + Prisma 7), `apps/web` (React 19 + Vite 8 +
    Tailwind 4), `packages/shared`.
  - Esquema de base de datos inicial: usuarios/roles/permisos/sesiones, categorías, atributos,
    productos, variantes, proveedores, ingresos, saldos y movimientos de inventario, inventario
    físico y auditoría. Restricciones CHECK y triggers append-only.
  - Seed idempotente: 18 permisos, 3 roles preliminares, administrador inicial, 12 definiciones de atributos.
  - Autenticación con sesiones en servidor (cookie httpOnly, SameSite=Strict, Argon2id), autorización
    por permisos, endpoints `/api/v1/health` y `/api/v1/auth/{login,logout,me}`.
  - Seguridad: helmet/CSP, CORS con lista blanca, rate limiting, protección CSRF por origen,
    redacción de datos sensibles en logs, manejo de errores con formato único.
  - Frontend: login, rutas protegidas, layout base, cliente API.
  - Pruebas: Vitest (unitarias, integración con PostgreSQL real, componentes) y Playwright (E2E).
  - Calidad: ESLint (typescript-eslint strict), Prettier, Husky + lint-staged, TypeScript estricto.
  - Docker (PostgreSQL de desarrollo, imagen de producción), GitHub Actions (CI).
  - Documentación: arquitectura, base de datos, dominio, pendientes, API, seguridad, despliegue,
    backups, pruebas, 12 ADRs. `CLAUDE.md`, agentes y skills para Claude Code.

# Joyería Sole — Inventario y Control de Productos

Sistema web para gestionar el catálogo (productos y variantes), los ingresos de mercadería, el
inventario y su trazabilidad en una tienda de joyería y productos de moda.

**Estado:** entorno preparado para la **Fase 1**. Las funcionalidades de negocio aún no están
implementadas: esperan la aprobación de las decisiones de
[`docs/business/PENDIENTES.md`](docs/business/PENDIENTES.md).

## Stack

React 19 · Vite 8 · Tailwind 4 · TanStack Query — Fastify 5 · Zod 4 · Prisma 7 — PostgreSQL 18 —
TypeScript 6 estricto · Vitest · Playwright · ESLint · Prettier · Docker · GitHub Actions

## Inicio rápido

```bash
cp .env.example .env     # completar contraseñas y AUTH_SECRET
npm install
npm run db:up            # PostgreSQL en Docker
npm run db:deploy        # migraciones
npm run db:seed          # roles, permisos y administrador inicial
npm run dev              # http://localhost:5173
```

Ingresar con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` de tu `.env`.

Guía completa: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Estructura

```
apps/api         API REST (Fastify + Prisma)
apps/web         Frontend (React + Vite)
packages/shared  Permisos, códigos de error y esquemas compartidos
docs/            Arquitectura, BD, negocio, API, seguridad, despliegue, pruebas, ADRs
.claude/         Agentes y skills para Claude Code
```

## Comandos principales

|                    |                                                             |
| ------------------ | ----------------------------------------------------------- |
| `npm run dev`      | Desarrollo (API + web)                                      |
| `npm run check`    | Lint + formato + tipos + tests + build (lo mismo que el CI) |
| `npm test`         | Tests unitarios, de integración y de componentes            |
| `npm run test:e2e` | Tests E2E (Playwright)                                      |
| `npm run build`    | Compilación de producción                                   |

## Documentación

Índice en [docs/README.md](docs/README.md). Para colaborar: [CONTRIBUTING.md](CONTRIBUTING.md).
Para trabajar con Claude Code: [CLAUDE.md](CLAUDE.md).

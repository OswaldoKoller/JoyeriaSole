# Joyería Sole — Inventario y Control de Productos

Sistema web para gestionar el catálogo (productos y variantes), los ingresos de mercadería, el
inventario y su trazabilidad en una tienda de joyería y productos de moda.

**Estado (Fase 1):** construida en `main` según el [plan de desarrollo](docs/engineering/PLAN-DESARROLLO-F1-2026-11.md)
(sección 12, rebanadas S0 a S13) y el [CHANGELOG](CHANGELOG.md).

- **Implementado:** usuarios, roles y permisos; proveedores; catálogo (categorías, atributos, productos, variantes,
  SKU, códigos, etiquetas y fotos); ingresos de mercadería con costos (también en dólares); precios de venta con
  solicitud, aprobación e historial; inventario (saldos, movimientos, alertas, stock inicial); ajustes con
  solicitud y aprobación; conteo físico a ciegas con segundo recuento; base de cambios de pieza (solo API, sin
  pantalla); bandeja de pendientes de aprobación y auditoría (solo Administrador).
- **Pendiente:** reportes y exportaciones, importación de datos, y despliegue y demostración al cliente (hosting y
  dominio sin definir, P-18). El plan detalla además la seguridad residual (S12).
- **Fase 2 (ventas):** solo hay [propuestas de análisis](docs/propuestas/fase-2-ventas/README.md); no está
  autorizada su implementación.

Las decisiones de negocio y su estado se registran en
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

## Quién autoriza (regla del cliente, 2026-11-05)

El **Administrador** y el **Responsable de inventario** pueden autorizar: aprobar o rechazar ajustes de
inventario, aprobar o cambiar precios de venta, cargar el stock inicial y aprobar conteos físicos. El
Responsable puede aprobar sus propias solicitudes; todo queda en la auditoría. Siguen siendo solo del
Administrador la auditoría, los usuarios y roles, el borrado físico de productos y la configuración. Detalle
en [`docs/security/SECURITY.md`](docs/security/SECURITY.md) y
[`docs/business/RESOLUCIONES-2026-11-05.md`](docs/business/RESOLUCIONES-2026-11-05.md).

Estado por rebanada: [plan de desarrollo de Fase 1](docs/engineering/PLAN-DESARROLLO-F1-2026-11.md), sección 12.
Documentos de octubre, con el estado de esa fecha: [preparación de Fase 1](docs/engineering/PHASE-1-PREPARATION.md)
y [roadmap de Fase 1](docs/engineering/ROADMAP.md) (orden y criterios de aceptación; línea base 2026-10-10).
Para validar sin usar datos de desarrollo: Docker iniciado, `npx playwright install chromium`
y `npm run qa`. El comando crea y elimina su propia base de pruebas.

## Estructura

```
apps/api         API REST (Fastify + Prisma)
apps/web         Frontend (React + Vite)
packages/shared  Permisos, códigos de error y esquemas compartidos
docs/            Arquitectura, BD, negocio, API, seguridad, despliegue, pruebas, ADRs
.claude/         Agentes y skills para Claude Code
```

## Comandos principales

|                  |                                                             |
| ---------------- | ----------------------------------------------------------- |
| `npm run dev`    | Desarrollo (API + web)                                      |
| `npm run check`  | Lint + formato + tipos + tests + build; requiere BD de test |
| `npm test`       | Tests unitarios, de integración y de componentes            |
| `npm run qa`     | Check + E2E en PostgreSQL efímero                           |
| `npm run qa:e2e` | Solo E2E, con base efímera y servidores propios             |
| `npm run build`  | Compilación de producción                                   |

## Documentación

Índice en [docs/README.md](docs/README.md). Para colaborar: [CONTRIBUTING.md](CONTRIBUTING.md).
Para trabajar con Claude Code: [CLAUDE.md](CLAUDE.md).

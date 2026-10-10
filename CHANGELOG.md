# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado

- Datos de demostración ficticios (`npm run db:seed:demo`) y pruebas E2E por roles: login y menú según el rol, rutas protegidas (web y API), crear/editar/verificar productos y carga de stock. Límite de login configurable (`LOGIN_RATE_LIMIT_MAX`, 10 por defecto).
- Módulo de proveedores: lista con búsqueda, filtros y paginación; alta, edición y cambio de estado desde la web; API protegida por permisos con auditoría transaccional y pruebas E2E.
- Menú de navegación para las páginas disponibles (Inicio y Proveedores), con estado activo y acceso según permisos; Inicio muestra un acceso directo a Proveedores.
- Consulta y gestión de usuarios: búsqueda, filtros, edición de nombre/estado, revocación de sesiones y varios roles con auditoría.
- Alta de usuarios y cambio de contraseña propia: mínimo 10 caracteres, sesiones fijas de 3 horas y nuevo login tras el cambio. API y pantallas implementadas; recorrido E2E final por verificar.
- Primera porción de catálogo: categorías de hasta dos niveles y consulta/alta de valores de atributos de tipo lista. Pendiente de pruebas funcionales.
- Ficha simple de producto con variante base, SKU correlativo, precio en bolivianos y código de barras del proveedor u opción de generar uno propio con vista previa Code 128 y descarga SVG.
- Ejes de variante por atributos de lista y creación de combinaciones únicas, cada una con SKU correlativo.
- Inventario inicial por variante, saldos, alertas sin stock/bajo mínimo e historial. Movimiento, saldo y auditoría se guardan atómicamente.

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

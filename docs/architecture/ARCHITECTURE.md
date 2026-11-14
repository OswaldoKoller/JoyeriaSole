# Arquitectura

## Vista general

```
Usuario (navegador, lector de códigos USB/Bluetooth como teclado)
   │ HTTPS (TLS terminado por el hosting)
   ▼
┌──────────────────────────────────────────────┐
│ Servicio único (contenedor Node.js 22)       │
│  ├─ /            → SPA React compilada        │
│  └─ /api/v1/*    → API REST Fastify           │
└──────────────────────────────────────────────┘
   │ TLS
   ▼
PostgreSQL administrado (backups automáticos + PITR) ──► backup externo diario (R2/S3)
```

**Monolito modular**: un solo despliegue, dividido internamente en módulos de dominio con límites
claros. Es la opción más simple y económica para una pyme, y permite extraer módulos en el futuro
si fuera necesario (no se espera).

## Monorepo (npm workspaces)

| Paquete           | Rol                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api`        | API REST (Fastify 5 + TypeScript + Prisma 7 + PostgreSQL)                                                                      |
| `apps/web`        | Frontend SPA (React 19 + Vite 8 + Tailwind 4 + TanStack Query + React Router)                                                  |
| `packages/shared` | Contratos compartidos: permisos, códigos de error, esquemas Zod. Una sola fuente de verdad para validar en frontend y backend. |

## Stack y justificación

| Capa         | Elección                                                              | Por qué                                                                                                                           | Alternativas descartadas                                                                                                    |
| ------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Lenguaje     | TypeScript 6 estricto                                                 | Un solo lenguaje en todo el sistema; tipos de punta a punta.                                                                      | — (TS 7 aún no es compatible con typescript-eslint)                                                                         |
| Backend      | **Fastify 5**                                                         | Rápido, ligero, validación por esquema nativa, plugins para seguridad (helmet, CORS, rate-limit, cookies), logger pino integrado. | NestJS (más ceremonia/abstracción de la necesaria para este tamaño); Express (sin validación ni tipado nativos, más lento). |
| Validación   | **Zod 4**                                                             | Mismo esquema en API y UI; mensajes en español.                                                                                   | —                                                                                                                           |
| ORM          | **Prisma 7** (adapter `pg`)                                           | Migraciones versionadas, cliente tipado, Prisma Studio para soporte.                                                              | Drizzle (válido, pero migraciones y tooling menos maduros para un equipo pequeño).                                          |
| BD           | **PostgreSQL 18**                                                     | Transacciones ACID (críticas para stock), restricciones CHECK, triggers, JSONB para auditoría, oferta administrada amplia.        | MySQL (menos expresivo en restricciones); NoSQL (inadecuado para inventario transaccional).                                 |
| Auth         | **Sesiones en servidor** con cookie httpOnly                          | Revocables al instante, sin tokens en JavaScript (mitiga XSS). Ver ADR-003.                                                       | JWT en localStorage.                                                                                                        |
| Frontend     | **React + Vite + Tailwind**                                           | Ecosistema estándar, build rápido, estilos utilitarios sin CSS disperso.                                                          | Next.js (SSR innecesario para un sistema interno con login).                                                                |
| Datos en UI  | **TanStack Query**                                                    | Caché, reintentos y estados de carga sin estado global manual.                                                                    | Redux.                                                                                                                      |
| Tests        | **Vitest** + Testing Library + **Playwright**                         | Rápidos, misma configuración que Vite, E2E en navegador real.                                                                     | Jest.                                                                                                                       |
| Calidad      | ESLint 10 (typescript-eslint strict) + Prettier + Husky + lint-staged | Errores detectados antes del commit.                                                                                              | —                                                                                                                           |
| Contenedores | Docker (solo BD en dev; imagen única en prod)                         | Ver ADR-012.                                                                                                                      | —                                                                                                                           |
| CI           | GitHub Actions                                                        | Gratuito para repos privados pequeños; Postgres como servicio.                                                                    | —                                                                                                                           |

## Estructura de la API

```
apps/api/src/
├── server.ts            # arranque y apagado ordenado
├── app.ts               # buildApp(): registra plugins y módulos (usado también por los tests)
├── config/env.ts        # variables de entorno validadas con Zod (falla al arrancar si falta algo)
├── lib/                 # utilidades sin dependencias de dominio (errores, password, tokens, prisma, permisos, sku)
├── plugins/             # transversales: security, error-handler, prisma, auth, idempotency
├── modules/<modulo>/    # un módulo por área de negocio
│   ├── <modulo>.routes.ts    # HTTP: esquemas Zod, permisos, códigos de respuesta
│   ├── <modulo>.service.ts   # reglas de negocio y transacciones
│   └── <modulo>.schemas.ts   # (opcional) esquemas locales si no se comparten con la UI
└── generated/prisma/    # cliente generado (no versionado)
```

Reglas de capas:

1. **routes** solo traducen HTTP ↔ servicio. Sin lógica de negocio.
2. **services** contienen las reglas, abren transacciones y escriben auditoría.
3. El cambio de stock se concentra en el módulo `inventory`. **Toda** escritura en el libro pasa por
   `applyStockChanges` (`modules/inventory/stock-ledger.ts`): ingresos, stock inicial, ajustes, cambios de
   pieza, conteos y ventas (unificado en E0, commit `d2584b5`; una prueba-guarda lo vigila). Los bloqueos
   auxiliares viven en `modules/inventory/stock-locks.ts`. Además la base garantiza saldo = libro (I-01)
   y unicidad por documento y variante (I-02).
4. Los módulos no acceden a tablas de otro módulo para escribir: llaman a su servicio.

Módulos implementados (`apps/api/src/modules`, registrados en `app.ts` bajo `/api/v1`):

- `auth` (`/auth`): login, logout, sesión actual y cambio de contraseña.
- `health` (`/health`): estado del servicio y de la base de datos (público).
- `users` (`/users`): usuarios, listado y asignación de roles, y restablecimiento de clave temporal.
- `suppliers` (`/suppliers`): proveedores.
- `catalog` (`/categories`, `/attributes`, `/products`, `/catalog/variants`): categorías, atributos,
  productos, variantes y búsqueda por código; la subcarpeta `catalog/photos` gestiona las fotos del
  producto (`/products/:id/photos`, `/products/variants/:variantId/cover`).
- `stock-entries` (`/stock-entries`, `/stock-entry-cost-types`, `/products/variants/:id/cost-history`):
  ingresos de mercadería, tipos de costo e historial de costos por variante.
- `inventory` (`/inventory`, `/inventory/adjustments`, `/inventory/exchanges`): saldos, movimientos,
  stock inicial, ajustes con solicitud y aprobación, cambios de pieza y la operación `applyStockChanges`.
- `inventory-counts` (`/inventory/counts`): conteo físico a ciegas con segundo recuento.
- `pricing` (`/pricing`): precios de venta con solicitud, aprobación e historial.
- `approvals` (`/approvals/pending`): bandeja de pendientes de aprobación del Inicio.
- `audit` (`/audit`): consulta de auditoría (solo lectura, solo Administrador) y `recordAudit`.
- `roles` (`/roles`): gestión de roles y permisos (P-46).
- `cash` (`/cash`): caja única: apertura, cierre con arqueo y correcciones append-only (ADR-023).
- `sales` (`/sales`, `/payment-methods`, `/sale-incidents`): venta de mostrador inmutable, comprobante
  interno e incidencias sin efecto en stock ni importes (ADR-022, ADR-024; sin anulaciones, DEC-V07).
- `settings` (`/settings/business`): datos del negocio para el comprobante (solo Administrador).

## Estructura del frontend

```
apps/web/src/
├── main.tsx, index.css
├── app/          # router, layout, query client
├── components/ui # componentes reutilizables sin lógica de negocio (Button, Input, ...)
├── features/<f>/ # una carpeta por área (auth, catalog, inventory...): páginas, hooks, componentes
├── lib/          # api-client y utilidades
├── pages/        # páginas genéricas (inicio, 404)
└── test/         # setup y helpers de pruebas
```

- En desarrollo Vite redirige `/api` a la API (proxy) → mismo origen que producción.
- La protección de rutas en el frontend es solo UX; **la API valida permisos en cada petición**.
- Lectores de códigos de barras: funcionan como teclado (HID). Un campo de búsqueda con foco recibe
  el código seguido de Enter; no se necesita driver ni integración por marca.
- **Carga por rutas y archivos de la web.** Solo Login, el panel (`AppShell`), Inicio y Mi cuenta van
  en la carga inicial; el resto de las pantallas se descargan al visitarlas con `lazyPage`
  (`app/lazy-page.tsx`: `React.lazy` + `Suspense` con `PageLoading`, `role="status"` y «Cargando…»;
  la sección no se descarga hasta que `RequireAuth` confirma sesión y permisos). Si la descarga falla
  (p. ej. tras un despliegue nuevo con archivos de otro hash), el `errorElement` (`RouteError`) muestra
  «Recargar la página». `vite.config.ts` agrupa React, React Router, TanStack Query y Zod en archivos
  `vendor-*` para que se mantengan en caché entre versiones.

  | Medición (`npm run build -w @joyeria/web`) | Antes (2026-11-13)        | Después                                              |
  | ------------------------------------------ | ------------------------- | ---------------------------------------------------- |
  | Archivo de entrada `index-*.js`            | 376,5 kB (116,8 kB gzip)  | 65,7 kB (19,5 kB gzip)                               |
  | Mayor archivo                              | 376,5 kB                  | 218,8 kB (`vendor-react`)                            |
  | Archivos de librerías                      | 163 kB compartido (47 kB) | react 218,8 · zod 96,2 · router 93,4 · query 34,9 kB |
  | JS de la carga inicial (suma, 7 archivos)  | 545,5 kB (165,1 kB gzip)  | 545,5 kB (165,1 kB gzip)                             |
  | Avisos de Vite (> 500 kB)                  | ninguno                   | ninguno                                              |

  El total inicial no baja porque React, el router y Zod hacen falta para pintar Login; la mejora es
  de caché (una versión nueva solo invalida ~66 kB de código propio) y de análisis en el navegador.
  Reducir más exigiría quitar Zod de Login o cargar Inicio bajo demanda (no hecho: añadiría una espera
  al abrir la aplicación).

## Flujo de una petición

```
Request → helmet/CORS → rate limit → verificación de origen (CSRF) → lectura del cuerpo
  → preValidation authenticate / requirePermission (401/403) → validación Zod (400)
  → handler → service (transacción + auditoría)
  → respuesta { data } | error handler → { error: { code, message, details?, requestId } }
```

La autorización va en `preValidation`, **antes** de validar el cuerpo y no en `preHandler`: quien no tiene
sesión o permiso recibe 401/403 y nunca un 400 con el detalle del esquema. Las rutas de negocio usan
`preValidation: app.requirePermission(...)` (o `requireAnyPermission`); las de `/auth/*` usan
`preValidation: app.authenticate`. Las rutas de imágenes aplican además su límite por usuario en
`preHandler`, después de autenticar (`catalog/photos/photos.routes.ts`).

## Evolución prevista (no implementar sin aprobación)

| Fase futura                        | Cómo encaja                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ventas / POS                       | **Autorizado el 2026-11-10** (plan `docs/propuestas/fase-2-ventas/11-plan-de-implementacion.md`): módulos `sales`, `cash` y `settings`; la venta genera `SALE` vía el servicio de inventario. Sin anulaciones (DEC-V07). |
| Facturación / Impuestos Nacionales | Descartado por Q-V02: la factura fiscal se emite en un sistema externo; aquí solo hay comprobante interno (DEC-V12).                                                                                                     |
| Múltiples sucursales               | Agregar tabla `locations` y `location_id` a saldos, movimientos, ingresos y conteos (la PK de `inventory_balances` pasa a `(variant_id, location_id)`). Migración planificable.                                          |
| Reportes                           | Consultas sobre `inventory_movements` (historial completo con costos) y vistas SQL.                                                                                                                                      |
| App móvil                          | Consume la misma API `/api/v1`; se agregaría auth por token si fuera necesario.                                                                                                                                          |
| Archivos (fotos)                   | Fotos ya implementadas en PostgreSQL tras la interfaz `PhotoStorage` ([ADR-020](../decisions/ADR-020-fotos-de-producto.md)); un bucket S3/R2 sería otra implementación (P-14).                                           |

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
├── lib/                 # utilidades sin dependencias de dominio (errores, password, tokens, prisma)
├── plugins/             # transversales: security, error-handler, prisma, auth
├── modules/<modulo>/    # un módulo por área de negocio
│   ├── <modulo>.routes.ts    # HTTP: esquemas Zod, permisos, códigos de respuesta
│   ├── <modulo>.service.ts   # reglas de negocio y transacciones
│   └── <modulo>.schemas.ts   # (opcional) esquemas locales si no se comparten con la UI
└── generated/prisma/    # cliente generado (no versionado)
```

Reglas de capas:

1. **routes** solo traducen HTTP ↔ servicio. Sin lógica de negocio.
2. **services** contienen las reglas, abren transacciones y escriben auditoría.
3. Cualquier cambio de stock pasa por **un único servicio de inventario** (a crear en Fase 1) que
   inserta el movimiento y actualiza el saldo en la misma transacción.
4. Los módulos no acceden a tablas de otro módulo para escribir: llaman a su servicio.

Módulos previstos para la Fase 1 (no implementados aún): `users`, `catalog` (categorías, atributos,
productos, variantes), `suppliers`, `stock-entries`, `inventory` (saldos, movimientos, ajustes),
`inventory-counts`, `audit` (consulta).

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

## Flujo de una petición

```
Request → helmet/CORS → rate limit → verificación de origen (CSRF) → validación Zod
  → preHandler authenticate / requirePermission → handler → service (transacción + auditoría)
  → respuesta { data } | error handler → { error: { code, message, details?, requestId } }
```

## Evolución prevista (no implementar sin aprobación)

| Fase futura                        | Cómo encaja                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ventas / POS                       | Nuevo módulo `sales`; genera movimientos `SALE`, `CUSTOMER_RETURN`, `EXCHANGE` (ya existen en el enum) vía el servicio de inventario. El rol Vendedor ya existe.                |
| Facturación / Impuestos Nacionales | Módulo `invoicing` aislado, integrado con el SIN mediante un adaptador; no toca inventario directamente.                                                                        |
| Múltiples sucursales               | Agregar tabla `locations` y `location_id` a saldos, movimientos, ingresos y conteos (la PK de `inventory_balances` pasa a `(variant_id, location_id)`). Migración planificable. |
| Reportes                           | Consultas sobre `inventory_movements` (historial completo con costos) y vistas SQL.                                                                                             |
| App móvil                          | Consume la misma API `/api/v1`; se agregaría auth por token si fuera necesario.                                                                                                 |
| Archivos (fotos)                   | Almacenamiento S3-compatible (Cloudflare R2) con URLs firmadas (P-14).                                                                                                          |

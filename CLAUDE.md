# CLAUDE.md — Joyería Sole: Inventario y Control de Productos

> Leer este archivo completo antes de modificar el proyecto. Las skills de `.claude/skills/` amplían
> cada área; los agentes de `.claude/agents/` definen quién puede tocar qué.

## Proyecto

Sistema web de inventario para una tienda de joyería y productos de moda (Bolivia). Pyme, pocos
usuarios, acceso desde Internet.

**Fase actual:** entorno preparado. **Fase 1 (pendiente de aprobación):** catálogo (categorías,
atributos, productos, variantes, SKU, códigos de barras, proveedores, costos, precios, stock mínimo,
estado), ingresos de mercadería, inventario (saldos, movimientos, ajustes, inventario físico),
control (sin stock, bajo mínimo, historial) y usuarios/roles/permisos.

**Principio:** primero se define el negocio y la arquitectura; después se implementa.
**No implementar funcionalidades de negocio sin aprobación explícita del usuario.**

## Arquitectura (resumen)

Monolito modular en monorepo npm workspaces. En producción un solo contenedor: la API sirve también
la SPA (mismo origen). Detalle: `docs/architecture/ARCHITECTURE.md`.

```
apps/api/               Fastify 5 + TypeScript + Prisma 7 + PostgreSQL 18
  prisma/schema.prisma  Modelo de datos (fuente de verdad)
  prisma/migrations/    Migraciones versionadas (SQL)
  prisma/seed.ts        Seed idempotente (estructura, no datos de negocio)
  src/app.ts            buildApp(): plugins + módulos bajo /api/v1
  src/config/env.ts     Variables de entorno validadas con Zod
  src/lib/              errors, password, tokens, prisma
  src/plugins/          security, error-handler, prisma, auth
  src/modules/<m>/      <m>.routes.ts (HTTP) + <m>.service.ts (negocio)
  test/unit|integration|helpers
apps/web/               React 19 + Vite 8 + Tailwind 4 + TanStack Query + React Router 8
  src/app/              router, layout, query client
  src/components/ui/    componentes reutilizables sin lógica de negocio
  src/features/<f>/     páginas, hooks y componentes por área
  src/lib/api-client.ts cliente HTTP (cookie de sesión, errores tipados)
  e2e/                  Playwright
packages/shared/        permisos, códigos de error, esquemas Zod (compartidos API/web)
docs/                   documentación; docs/decisions = ADRs; docs/business/PENDIENTES.md
```

## Comandos

```bash
npm run db:up            # PostgreSQL 18 en Docker, puerto 5434 (joyeria_dev + joyeria_test)
npm run dev              # API :3000 + web :5173 (proxy /api → API)
npm run check            # lint + format:check + typecheck + test + build (= CI). Correr antes de terminar.
npm test                 # unitarias + integración (BD real joyeria_test) + componentes
npm run test:e2e         # Playwright (requiere `npx playwright install chromium` una vez)
npm run db:migrate -- --name <nombre>   # nueva migración desde schema.prisma
npm run db:deploy        # aplicar migraciones · npm run db:seed · npm run db:studio
```

Shell en Windows: Git Bash/PowerShell. `.env` está en la **raíz** del repo.

## Reglas de negocio CONOCIDAS (confirmadas por el requerimiento)

1. El **stock se controla por variante**, nunca por producto (ADR-001). Todo producto tiene ≥ 1 variante.
2. **SKU único y código de barras único**; un código identifica una variante concreta.
3. El stock **nunca se edita directamente**: todo cambio es un movimiento en `inventory_movements`
   (append-only) y actualiza `inventory_balances` en la **misma transacción** (ADR-007).
4. Un **ingreso** no cambia el stock hasta ser **confirmado** (ADR-008).
5. Los **ajustes** requieren autorización y dejan trazabilidad completa (quién, cuándo, variante,
   cantidad anterior/nueva, diferencia, motivo, observación) (ADR-009).
6. Acciones importantes quedan en **auditoría** (`audit_logs`) en la misma transacción (ADR-010).
7. Roles iniciales preliminares: Administrador, Responsable de inventario, Vendedor.

## Decisiones PENDIENTES — no convertir en reglas

Ver `docs/business/PENDIENTES.md` (P-01 … P-27). Las más sensibles:

- **P-03: "Costo total × 2 = precio de venta" — PENDIENTE DE CONFIRMACIÓN.** No implementar como regla.
- P-05 formato de SKU · P-06 códigos de barras/QR · P-07 prorrateo y método de costeo ·
  P-08 stock negativo · P-09 unidades (piezas vs. peso/longitud) · P-01/P-02 permisos de roles ·
  P-13 alcance del inventario físico · P-10 moneda.

Si una tarea depende de una decisión pendiente: **detenerse y preguntar**, proponer alternativas, no asumir.
Si se descubre una decisión no listada: agregarla a PENDIENTES.md.

## Reglas de desarrollo

### Backend

- Rutas: esquema Zod para `body/querystring/params` **y** `response`; `preHandler: app.requirePermission(...)`
  en todo endpoint no público. Los handlers solo delegan al servicio.
- Servicios: reglas de negocio, `prisma.$transaction`, `recordAudit(tx, ...)` en la misma transacción.
- Errores: lanzar subclases de `AppError` (`ValidationError`, `NotFoundError`, `ConflictError`,
  `BusinessRuleError`, `ForbiddenError`...). Nunca devolver errores internos.
- Respuestas: `{ data }` / `{ data, meta }`. Montos `Decimal` serializados como string.
- Stock: **solo** a través del futuro servicio de inventario (`modules/inventory`). Ningún otro módulo
  escribe en `inventory_movements` / `inventory_balances`.
- Importaciones relativas con extensión `.ts` (`import { x } from './x.ts'`).
- Usar `getAuth(request)` para obtener el usuario en rutas protegidas.

### Base de datos

- Cambios al modelo solo vía `schema.prisma` + migración. **Nunca editar una migración aplicada**: crear otra.
- SQL extra (CHECK, triggers, índices parciales): `prisma migrate dev --create-only`, editar, aplicar.
- Dinero en `Decimal`; IDs UUID v7; `timestamptz`; nombres snake_case vía `@map`.
- No borrar entidades con historial: desactivar.
- Actualizar `docs/database/DATABASE.md` cuando cambie el modelo.

### Frontend

- Datos del servidor con TanStack Query (hooks en `features/<f>/`). Sin estado global manual.
- Formularios validados con los esquemas de `@joyeria/shared` (mismos que la API).
- `RequireAuth permissions={[...]}` y `useHasPermission` son solo UX; la seguridad está en la API.
- Componentes genéricos en `components/ui`; nada de lógica de negocio ahí.
- Textos de interfaz en español. Accesibilidad: labels asociados, roles ARIA, foco visible.
- Lectores de códigos: se comportan como teclado (texto + Enter); no integrar marcas específicas.

### Convenciones

- TypeScript estricto; sin `any`, sin `!` salvo en tests. ESLint con 0 advertencias.
- Archivos `kebab-case`; componentes React `PascalCase`; constantes `UPPER_SNAKE_CASE`.
- Código e identificadores en inglés; textos de usuario, comentarios y documentación en español.
- Conventional Commits en español; commits pequeños; ramas `feature/*`, `fix/*` desde `develop`.

### Pruebas

- Toda funcionalidad nueva con tests: unitarios para lógica pura, integración para endpoints
  (401/403/400/caso feliz) y para cualquier efecto en stock o auditoría.
- Helpers: `buildTestApp`, `login`, `createTestUser`, `resetDatabase` (`apps/api/test/helpers/`).

## Seguridad (obligatorio)

- Nunca secretos en el código; solo `.env` (no versionado) y variables del hosting. Nuevas variables:
  agregarlas a `config/env.ts` (validadas) y a `.env.example`.
- Nunca SQL concatenado; `$queryRaw` solo con tagged template. Nunca `dangerouslySetInnerHTML`.
- Nunca exponer `passwordHash`, `tokenHash` ni sesiones; declarar siempre el esquema de respuesta.
- Nunca registrar contraseñas, tokens o cookies en logs.
- Detalle: `docs/security/SECURITY.md`.

## NO hacer

- ❌ Implementar módulos de Fase 1 sin aprobación explícita.
- ❌ Punto de venta, facturación, Impuestos Nacionales, contabilidad, multi-sucursal, app móvil, IA,
  compras automáticas, integraciones bancarias.
- ❌ Convertir decisiones PENDIENTES en reglas; inventar requisitos.
- ❌ Modificar stock sin movimiento; editar/borrar movimientos o auditoría.
- ❌ Editar migraciones ya aplicadas; ejecutar `db:reset` o comandos destructivos sin confirmación.
- ❌ Desactivar reglas de ESLint, usar `--no-verify`, o bajar el nivel de TypeScript para "hacer pasar" algo.
- ❌ Commitear `.env`, dumps o credenciales. Hacer commits o push sin que el usuario lo pida.
- ❌ Agregar dependencias sin justificarlas.

## Decisiones importantes

ADRs en `docs/decisions/`: 001 producto/variante · 002 PostgreSQL+Prisma · 003 sesiones · 004 RBAC por
permisos · 005 categorías en árbol · 006 atributos · 007 libro de movimientos · 008 ingresos y costos ·
009 inventario físico · 010 logs vs. auditoría · 011 stack · 012 despliegue.

## Agentes y skills

- Agentes (`.claude/agents/`): architecture, database, backend, frontend, security, testing, devops,
  documentation. Cada uno con responsabilidades, límites y archivos permitidos.
- Skills (`.claude/skills/`): project-architecture, database-design, inventory-domain,
  api-development, frontend-development, security, testing, git-workflow, deployment, documentation.

## Definición de terminado

1. `npm run check` pasa. 2. Tests nuevos cubren el cambio. 3. Documentación/ADR actualizados si
   corresponde. 4. Sin decisiones pendientes implementadas por suposición. 5. CHANGELOG actualizado si
   el cambio es visible.

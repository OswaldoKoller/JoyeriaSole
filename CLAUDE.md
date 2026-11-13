# CLAUDE.md — Joyería Sole: Inventario y Control de Productos

> Leer este archivo completo antes de modificar el proyecto. Las skills de `.claude/skills/` amplían
> cada área; los agentes de `.claude/agents/` definen quién puede tocar qué.

## Proyecto

Sistema web de inventario para una tienda de joyería y productos de moda (Bolivia). Pyme, pocos
usuarios. Despliegue previsto: LOCAL en la PC de la tienda (decisión D5 del 2026-11-09; pendiente de preparar).

**Fase actual:** Fase 1 implementada e integrada en `main` (2026-11-06; el cierre formal sigue pendiente: reportes, importador, puesta en marcha y aceptación, ver `docs/informe-tecnico/`) tras las reuniones del 2026-11-05 (catálogo, ingresos, precios, inventario, ajustes, conteos, usuarios); ver `docs/engineering/PLAN-DESARROLLO-F1-2026-11.md` §12. **Alcance de Fase 1:** catálogo (categorías,
atributos, productos, variantes, SKU, códigos de barras, proveedores, costos, precios, stock mínimo,
estado), ingresos de mercadería, inventario (saldos, movimientos, ajustes, inventario físico),
control (sin stock, bajo mínimo, historial) y usuarios/roles/permisos.

**Fase 2 (Ventas): implementación AUTORIZADA el 2026-11-10** (ver `docs/business/RESOLUCIONES-2026-11-10.md`),
delimitada por el plan `docs/propuestas/fase-2-ventas/11-plan-de-implementacion.md` (E1 venta de
mostrador y comprobante interno, E3 caja única). Decisiones confirmadas que restringen el diseño: venta
de mostrador pagada íntegramente al momento (sin créditos ni apartados), pagos en Bs (efectivo, QR,
transferencia), facturación fiscal en un sistema externo, **no se anulan las ventas confirmadas
(DEC-V07)**, caja única con apertura, cierre y arqueo (DEC-V09) y comprobante interno imprimible
(DEC-V12). Los valores marcados «POR DEFECTO — PENDIENTE DE CONFIRMACIÓN» en el plan no son reglas:
deben quedar configurables o fáciles de cambiar.

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
npm run test:e2e         # Playwright (requiere `npx playwright install chromium` y las variables del runner)
npm run qa -- check      # lo mismo que `check` sobre una BD efímera (no toca joyeria_dev/joyeria_test)
npm run qa -- api [x.test.ts] · npm run qa -- e2e [x.spec.ts]   # solo API o solo E2E (preferido para correr pruebas)
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
5. Los **ajustes** requieren autorización (la dan el Administrador **o** el Responsable de inventario,
   regla del cliente 2026-11-05; el flujo solicitar → aprobar sigue para roles con solo
   `inventory:adjust`) y dejan trazabilidad completa (quién, cuándo, variante,
   cantidad anterior/nueva, diferencia, motivo, observación) (ADR-009).
6. Acciones importantes quedan en **auditoría** (`audit_logs`) en la misma transacción (ADR-010).
7. Roles iniciales preliminares: Administrador, Responsable de inventario, Vendedor. Autorizan
   (ajustes, precios, stock inicial, conteos) el Administrador y el Responsable; exclusivos del
   Administrador: auditoría, usuarios/roles, borrado físico y configuración.
8. **Sesión fija de 8 horas** desde el login, sin extensión por actividad (P-19, Q-02; ADR-003).
9. **Sin stock negativo** (P-08): `CHECK (quantity >= 0)` en `inventory_balances` además de la validación del servicio.
10. **No se desactiva un producto o variante con stock > 0** (P-22): error `STOCK_BLOCKS_DEACTIVATION`; primero un ajuste de salida a cero.
11. La contraseña olvidada la restablece el Administrador con una clave **temporal** que debe cambiarse al entrar (F2); mientras tanto la API responde `PASSWORD_CHANGE_REQUIRED`.
12. El Vendedor no ve costos ni valorizaciones en ninguna respuesta (P-02, Q-15.2); la auditoría es solo del Administrador.

## Decisiones PENDIENTES — no convertir en reglas

Ver `docs/business/PENDIENTES.md` y `docs/business/RESOLUCIONES-2026-10-09.md`. Las más sensibles que siguen pendientes o parciales:

- **P-03: SUSTITUIDA (2026-11-05).** El cliente fija el precio de venta de cada ítem a mano; NO hay
  multiplicador ni redondeo ni sugerencia (ADR-018). No implementar "costo × 2".
- Resueltas e implementadas: P-01 (ajustes, precios y conteos: solicita y autoriza el Responsable o el
  Administrador), P-07 (prorrateo exacto, ADR-015/016), P-13 (conteo a ciegas por
  categoría, ADR-021). Siguen abiertas las de `docs/business/PENDIENTES.md` (p. ej. P-06 detalles de QR).

Si una tarea depende de una decisión pendiente: **detenerse y preguntar**, proponer alternativas, no asumir.
Si se descubre una decisión no listada: agregarla a PENDIENTES.md.

## Reglas de desarrollo

### Backend

- Rutas: esquema Zod para `body/querystring/params` **y** `response`; `preValidation: app.requirePermission(...)`
  en todo endpoint no público. Los handlers solo delegan al servicio.
- Servicios: reglas de negocio, `prisma.$transaction`, `recordAudit(tx, ...)` en la misma transacción.
- Errores: lanzar subclases de `AppError` (`ValidationError`, `NotFoundError`, `ConflictError`,
  `BusinessRuleError`, `ForbiddenError`...). Nunca devolver errores internos.
- Respuestas: `{ data }` / `{ data, meta }`. Montos `Decimal` serializados como string.
- Stock: **solo** a través del servicio de inventario (`applyStockChanges`, `modules/inventory`). Ningún otro módulo
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
- ❌ Facturación fiscal, Impuestos Nacionales, contabilidad, multi-sucursal, app móvil, IA, compras
  automáticas, integraciones bancarias. (La venta de mostrador con comprobante interno sí está autorizada
  desde el 2026-11-10, dentro del plan 11.)
- ❌ Convertir decisiones PENDIENTES en reglas; inventar requisitos.
- ❌ Ampliar Ventas más allá del plan 11 sin autorización; y, en ningún caso, anulación de
  ventas confirmadas (`POST /sales/:id/void`, `sales:void`, `SALE_VOID`, estado `VOIDED`) ni ningún
  mecanismo de reversión equivalente o encubierto (DEC-V07).
- ❌ Modificar stock sin movimiento; editar/borrar movimientos o auditoría.
- ❌ Editar migraciones ya aplicadas; ejecutar `db:reset` o comandos destructivos sin confirmación.
- ❌ Desactivar reglas de ESLint, usar `--no-verify`, o bajar el nivel de TypeScript para "hacer pasar" algo.
- ❌ Commitear `.env`, dumps o credenciales. Hacer commits o push sin que el usuario lo pida.
- ❌ Agregar dependencias sin justificarlas.

## Decisiones importantes

ADRs en `docs/decisions/`: 001 producto/variante · 002 PostgreSQL+Prisma · 003 sesiones · 004 RBAC por
permisos · 005 categorías en árbol · 006 atributos · 007 libro de movimientos · 008 ingresos y costos ·
009 inventario físico · 010 logs vs. auditoría · 011 stack · 012 despliegue · 013 costeo de ingresos ·
014 conteos con movimientos · 015 reparto de centavos y valor cero · 016 compras en dólares e
importación · 017 ajustes con solicitud y aprobación · 018 aprobación e historial de precios ·
019 cambios de pieza · 020 fotos de producto · 021 conteo a ciegas con segundo recuento.
022 venta de mostrador inmutable · 023 caja única, arqueo y correcciones · 024 comprobante interno
(aceptados con la autorización del 2026-11-10). Otros números de ADR citados en `docs/informe-tecnico/`
o `docs/propuestas/` (p. ej. 025 anulaciones) son propuestas no emitidas; ver `docs/decisions/README.md`.

## Agentes y skills

- Agentes (`.claude/agents/`): architecture, database, backend, frontend, security, testing, devops,
  documentation. Cada uno con responsabilidades, límites y archivos permitidos.
- Skills (`.claude/skills/`): project-architecture, database-design, inventory-domain,
  api-development, frontend-development, security, testing, git-workflow, deployment, documentation.

## Definición de terminado

1. `npm run check` pasa. 2. Tests nuevos cubren el cambio. 3. Documentación/ADR actualizados si
   corresponde. 4. Sin decisiones pendientes implementadas por suposición. 5. CHANGELOG actualizado si
   el cambio es visible.

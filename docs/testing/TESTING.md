# Estrategia de pruebas

## Ejecución aislada recomendada

Con Docker Desktop iniciado, dependencias instaladas y Chromium disponible:

```bash
npm run qa       # PostgreSQL efímero + check + seed sintético + E2E
npm run qa:e2e   # PostgreSQL efímero + migraciones + seed sintético + E2E
```

El runner crea un contenedor exclusivo con puerto dinámico ligado a 127.0.0.1,
credenciales aleatorias y base joyeria_test; al finalizar lo detiene y elimina.
No utiliza el volumen de desarrollo ni el administrador de .env. Si se termina el
proceso a la fuerza, comprobar contenedores con etiqueta joyeria.qa=ephemeral y
detener únicamente el de esa ejecución. Las trazas de Playwright pueden contener
datos sintéticos de login: siguen excluidas de Git.

E2E usa API :3001 y web :5174; falla si ya hay servidores en esos puertos. No los
reutiliza. TEST_DATABASE_URL, AUTH_SECRET y SEED_ADMIN_* deben estar definidos
para ejecución manual; el runner los proporciona y aplica el seed previamente.
API_PROXY_TARGET configura el proxy de Vite en QA; desarrollo mantiene :3000.

| Nivel             | Herramienta                                 | Ubicación                    | Qué cubre                                                                                                     | Comando                    |
| ----------------- | ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Unitarias (API)   | Vitest                                      | `apps/api/test/unit/`        | Lógica pura: errores, contraseñas, tokens, configuración. Futuro: cálculos de costos, transiciones de estado. | `npm run test:unit`        |
| Integración (API) | Vitest + Fastify `inject` + PostgreSQL real | `apps/api/test/integration/` | Endpoints completos, auth, permisos, transacciones, restricciones de BD.                                      | `npm run test:integration` |
| Componentes (web) | Vitest + Testing Library + jsdom            | `apps/web/src/**/*.test.tsx` | Comportamiento de componentes y páginas (fetch simulado).                                                     | `npm test -w @joyeria/web` |
| E2E               | Playwright (Chromium)                       | `apps/web/e2e/`              | Flujos completos con servidores exclusivos y BD de pruebas.                                                   | `npm run test:e2e`         |

`npm test` ejecuta unitarias + integración + componentes. E2E se ejecuta aparte (más lento).

La suite web usa un worker thread compartido entre archivos. En Windows se observó un timeout
al arrancar un worker nuevo por archivo; los tests limpian el DOM y restauran mocks tras cada caso.
Se conservan aserciones y plazos de las pruebas.

## Base de datos de pruebas

- Base separada `joyeria_test` (creada automáticamente por `scripts/db-init/` en Docker).
- `TEST_DATABASE_URL` exige protocolo PostgreSQL, host localhost/127.0.0.1,
  nombre exacto joyeria_test y schema public. No admite otros parámetros de conexión.
  Esta protección no sustituye verificar que la instancia sea desechable: preferir npm run qa.
- `global-setup.ts` aplica las migraciones una vez; cada archivo vacía las tablas con `resetDatabase()`.
- Los archivos de integración corren en serie (comparten la base).

## Helpers

- `buildTestApp(configure?)` — app real con entorno de test; `configure` permite registrar rutas de prueba.
- `login(app, email, password)` — devuelve la cabecera `cookie` lista para `inject`.
- `createTestUser(prisma, { permissions })` — usuario con un rol ad-hoc con exactamente esos permisos.
- `seedAdjustmentReasons(prisma)` — siembra el catálogo de motivos de ajuste (`resetDatabase` lo vacía) y devuelve `code → id`.

## Qué debe probarse en la Fase 1 (obligatorio)

- Cada endpoint: 401 sin sesión, 403 sin permiso, 400 con datos inválidos, caso feliz.
- **Inventario**: todo cambio de stock genera movimiento; saldo = suma de movimientos; concurrencia
  (dos operaciones simultáneas sobre la misma variante no pierden actualizaciones).
- **Ingresos**: crear/editar borrador no cambia stock; confirmar sí, una sola vez; cancelar confirmado falla.
- **Ajustes** (`adjustments.test.ts`): solicitar no mueve stock; aprobar genera movimiento + saldo + auditoría atómicos; la aprobación **revalida** con el saldo vigente; si una línea falla no se aplica ninguna; concurrencia (dos aprobaciones contra el mismo saldo no dejan stock negativo, doble aprobación del mismo ajuste, orden de bloqueo distinto sin interbloqueo); el Responsable no aprueba, el Vendedor no ve nada; costos ocultos sin `costs:read`; triggers/CHECK de la BD.
- **Cambios de pieza** (`exchanges.test.ts` en unit e integration, `movements-page.test.tsx`, `stock-exchanges.spec.ts`): 401/403 (también Vendedor y quien solo ajusta)/400/422/404; caso feliz con dos movimientos que comparten `referenceId`, saldos y auditoría; **atomicidad** (la salida sin stock revierte la entrada, sin movimientos ni auditoría); misma variante e inactivas; concurrencia (dos cambios sobre la última unidad: uno 201, otro 422, saldo ≥ 0); sin `costs:read` no hay costos en POST ni GET; los movimientos aparecen en kardex e historial con etiquetas en español y son append-only. El E2E registra el cambio por la API (no hay pantalla) y comprueba el historial.
- **Conteo físico** (`inventory-counts.test.ts`, `count-logic.test.ts`, `inventory-counts.spec.ts`): alcance con subcategorías e inactivas con saldo; solapamientos (crear, iniciar y creación simultánea); **ciego** inspeccionando el JSON en captura y recuento (ningún campo de stock ni diferencia, tampoco para quien tiene todos los permisos); escaneo por SKU/código de barras/código de proveedor; hallazgos; operador único y `take`; reanudar tras un nuevo login; sin diferencias → revisión directa y con diferencias → recuento obligatorio; aprobar sin recuento rechazado; **conciliación con un ingreso confirmado durante el conteo**; aprobación atómica, doble aprobación y concurrencia; saldo no negativo (nada cambia); cancelación; costos ocultos sin `costs:read`; inmutabilidad en la BD. La conciliación y la detección de solapamientos son funciones puras con pruebas unitarias.
- Auditoría escrita en la misma transacción (si la operación falla, no queda auditoría huérfana).

## E2E — primera vez

```bash
npx playwright install chromium   # descarga el navegador (una vez por equipo)
npm run qa:e2e                   # crea BD efímera y servidores exclusivos
```

## Datos de demostración y E2E por roles

`npm run db:seed:demo` (antes `npm run db:seed`) crea datos **ficticios** marcados «DEMO»: 3 usuarios (uno por rol, contraseña `DEMO_USER_PASSWORD`), 4 categorías y 20 productos con stock variado (5 sin stock, 5 bajo mínimo, 10 disponibles). El stock entra como movimientos `INITIAL_STOCK` auditados, nunca editando saldos. También crea tres ajustes de ejemplo (dos pendientes y uno aprobado) que no alteran los niveles de stock del dashboard. Y dos conteos físicos de ejemplo (ADR-021): uno aprobado sin diferencias (DEMO Pulseras) y uno en captura a ciegas (DEMO Collares); tampoco alteran el stock. Se niega a correr con `NODE_ENV=production` o contra una base que no sea local. `npm run qa` lo ejecuta automáticamente.

| Usuario DEMO                    | Rol                       | Qué prueba                                                                                |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| demo-admin@example.invalid      | Administrador             | Todo el menú; carga de stock inicial                                                      |
| demo-inventario@example.invalid | Responsable de inventario | Sin Usuarios; crea/edita productos; solicita ajustes (`inventory:adjust`), no los aprueba |
| demo-vendedor@example.invalid   | Vendedor                  | Solo consulta; sin Proveedores ni Usuarios                                                |

`apps/web/e2e/roles-and-products.spec.ts` cubre: menú por rol, credenciales incorrectas, redirección al login sin sesión, bloqueo de rutas por permiso en la web **y** en la API (403), y crear → editar → verificar un producto con carga de stock. El sistema no tiene rol «cliente»: el Vendedor es el usuario restringido.

Ejecutar en local: `npm run qa` (todo, con PostgreSQL efímero) o `npm run qa:e2e` (solo E2E). Depurar un fallo: `npx playwright show-trace apps/web/test-results/<carpeta>/trace.zip`.

**Límite de login en E2E.** El login permite 10 intentos por IP cada 15 minutos (`LOGIN_RATE_LIMIT_MAX`). El servidor de E2E lo sube a 1000 porque la suite inicia sesión más de 10 veces; el valor de producción no cambia.

**E2E en serie.** `playwright.config.ts` fija `workers: 1`: todos los archivos comparten una base de datos y un servidor, y los totales del dashboard (`dashboard.spec.ts`) dependen de los datos DEMO sin modificar, por lo que ese archivo debe ejecutarse antes que los que crean productos (orden alfabético).

**Responsive.** `responsive.spec.ts` recorre 9 pantallas en 5 anchos (320, 390, 768, 1024, 1440 px) y falla si la página desborda horizontalmente **o** si algún botón, enlace o campo queda recortado por un contenedor con scroll horizontal (el defecto que el simple «sin scroll de página» no detecta).

**Limpieza de la base de integración.** `apps/api/test/helpers/global-setup.ts` vacía la base de pruebas al terminar la suite. Sin esto, las filas del último archivo sobrevivían y alteraban los totales exactos del dashboard cuando `npm run qa` reutilizaba la misma base para los E2E.

**Conteo físico.** `stock-counts.spec.ts` (E2E) recorre el flujo completo con el lector simulado (teclear el código + Enter) sobre «DEMO Aretes» con tres usuarios: el Responsable crea, captura (con deshacer, cantidades a mano y hallazgos) y cierra; el Administrador no puede capturar hasta tomar el conteo y hace el segundo recuento; el Vendedor no puede verlo ni aprobarlo (web y API); el Responsable regulariza un hallazgo y aprueba, y se comprueban el stock y el historial de movimientos. **Modifica el stock de DEMO Aretes**, por lo que corre después de `dashboard.spec.ts` (orden alfabético, `workers: 1`).

**Ingresos de mercadería.** `stock-entries.test.ts` (API) cubre permisos, borrador sin efecto en el stock, reparto, confirmación única, concurrencia (dos confirmaciones simultáneas e ingresos distintos sobre la misma variante), reversión completa ante un fallo, y `costing.test.ts` verifica en 500 casos aleatorios que la suma de las partes es exactamente el total. Se comprobó con **mutantes** que estas pruebas fallan si se quitan los bloqueos de fila. `stock-entries.spec.ts` (E2E) **modifica el stock de dos variantes DEMO**, por lo que debe correr después de `dashboard.spec.ts` y `responsive.spec.ts` (orden alfabético, `workers: 1`).

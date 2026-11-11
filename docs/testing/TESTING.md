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
| Unitarias (API)   | Vitest                                      | `apps/api/test/unit/`        | Lógica pura: errores, contraseñas, tokens, configuración, cálculos de costos (`costing`) y lógica de conteos. | `npm run test:unit`        |
| Integración (API) | Vitest + Fastify `inject` + PostgreSQL real | `apps/api/test/integration/` | Endpoints completos, auth, permisos, transacciones, restricciones de BD.                                      | `npm run test:integration` |
| Componentes (web) | Vitest + Testing Library + jsdom            | `apps/web/src/**/*.test.tsx` | Comportamiento de componentes y páginas (fetch simulado).                                                     | `npm test -w @joyeria/web` |
| E2E               | Playwright (Chromium)                       | `apps/web/e2e/`              | Flujos completos con servidores exclusivos y BD de pruebas.                                                   | `npm run qa -- e2e`        |

`npm test` ejecuta unitarias + integración + componentes. E2E se ejecuta aparte (más lento) con
`npm run qa -- e2e` (equivale a `npm run qa:e2e`). Lanzar `npm run test:e2e` a secas falla si no están
definidos `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` y `AUTH_SECRET` (`apps/web/playwright.config.ts`) y no
prepara la base de pruebas.

**Prueba de arranque de la imagen (smoke).** `bash scripts/smoke-image.sh <imagen>` (job `docker` del CI,
tras construir la imagen) arranca la imagen de producción contra un PostgreSQL efímero propio y comprueba
migraciones desde cero con el `CMD` real, `GET /api/v1/health` = 200, la SPA en `/`, el seed compilado
`node dist/seed.js` (dos veces) y el login del administrador sembrado (200; clave incorrecta 401). En local:
`docker build -t joyeria-sole:ci . && bash scripts/smoke-image.sh joyeria-sole:ci` (~40 s tras el build).
Detalle en [DEPLOYMENT.md](../deployment/DEPLOYMENT.md#prueba-de-arranque-de-la-imagen-smoke).

La suite web usa `pool: 'forks'` con un único proceso (`maxWorkers: 1`) y `isolate: false`
(`apps/web/vite.config.ts`): en Windows el pool de threads agotó el arranque sin ejecutar pruebas. Como
los archivos comparten proceso, `src/test/setup.ts` limpia el DOM y restaura los mocks tras cada caso.
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
- `assertLedgerInvariant(prisma)` (`helpers/ledger.ts`) — verifica, para cada variante, que saldo = Σ movimientos = `balance_after` del último movimiento, que la cadena de `balance_before`/`balance_after` es continua y que ningún producto o variante INACTIVE conserva stock. Úsela al final de cualquier prueba que mueva stock.
- `holdVariantLock`, `startAndWait`, `blockedSessions` (`helpers/locks.ts`) — ordenan carreras de forma determinista: una transacción de la prueba retiene el bloqueo de una variante, las operaciones reales se lanzan por HTTP y se espera (vía `pg_stat_activity`) a que queden bloqueadas antes de soltarlo.

## Libro de inventario (invariante, guarda y concurrencia)

- `test/unit/ledger-write-guard.test.ts` — lee el código fuente de `apps/api/src` y falla si aparece una escritura en `inventory_movements` / `inventory_balances` (cliente Prisma o SQL crudo) fuera de `modules/inventory/**`. Las lecturas están permitidas.
- `test/integration/ledger-apply.test.ts` — contrato de `applyStockChanges`: varias líneas, misma variante repetida, variante inexistente, saldo negativo, desbordamiento y `requireActive`.
- `test/integration/ledger-invariant.test.ts` — escenario mixto (stock inicial, ingreso confirmado, ajuste aprobado, conteo aprobado, cambio de pieza y eliminación de una ficha sin saldo) seguido de `assertLedgerInvariant`.
- `test/integration/ledger-concurrency.test.ts` — desactivar producto/variante frente a confirmar un ingreso o aprobar un ajuste (nunca queda INACTIVE con stock) y eliminar una ficha frente a una operación de stock (sin interbloqueo).

## Catálogo (S2)

- `catalog-complete.test.ts`: atributos y valores, categorías de dos niveles, características y ejes al crear,
  códigos repetidos (Q-10), búsqueda unificada, ficha incompleta/sin precio, eliminación física (B11) por cada causa.
- Web (Vitest): `code128.test.ts` (codificación y ancho), `label-settings.test.ts` (tamaños, localStorage y CSS
  `@page`), `label.test.tsx`, `labels-page.test.tsx`, `product-badges.test.tsx`, `attribute-values.test.ts`.
- E2E `s2-catalog-complete.spec.ts`: el Responsable crea un producto con atributos y variantes, imprime la vista
  previa de etiquetas (estilo `@page` y SVG), el Administrador elimina una ficha sin movimientos y el Vendedor
  solo consulta. La vista de impresión se verifica con `page.emulateMedia({ media: 'print' })`.

## Auditoría (solo Administrador)

- Unitarias `audit-redaction.test.ts` (API): qué claves son sensibles, redacción recursiva en objetos y arreglos, `null`/booleanos
  conservados, entrada sin modificar y límite de profundidad. `audit-logic.test.ts` (web): diccionario de etiquetas con
  fallback al código crudo, diferencias antes/después (creación, eliminación, anidados, arreglos, `null` vs ausente) y
  filtros de la URL (día completo en hora de La Paz).
- Integración `audit.test.ts`: 401 y 403 (Responsable y Vendedor) en los tres endpoints, 400 por filtros inválidos
  (UUID, fechas, `from > to`, paginación, id no numérico), sin rutas de escritura, orden `createdAt desc, id desc` con
  desempate, paginación, filtros combinados (acción exacta/prefijo, usuario, entidad, intervalo cerrado), búsqueda
  `q` con `%` y `_` literales, detalle 200/404 con `userAgent`, **redacción efectiva** de claves sensibles guardadas en
  `before/after/metadata` y `actions` ordenado.
- Componentes `audit-page.test.tsx`: tabla en modo tarjetas, fecha de La Paz, filtros iniciales desde la URL,
  aplicar/limpiar, rango invertido bloqueado, estados vacío/error, detalle con diferencias resaltadas, JSON completo
  escapado en `<pre>` y cierre con Esc; `app-shell.test.tsx`: «Auditoría» solo con `audit:read`.
- E2E `s10-audit.spec.ts`: el Administrador crea y edita un proveedor, lo encuentra en la auditoría y ve el antes/después
  (el proveedor queda inactivo); sin desbordes a 320/768/1440 px; el Responsable y el Vendedor no ven el menú, la
  pantalla ni la API (403). `responsive.spec.ts` incluye `/auditoria`.

## Fotos de producto (S3)

- Unitarias `image-processing.test.ts`: firma de bytes (JPEG/PNG/WebP; SVG, HTML, GIF, EXE y RIFF/WAVE
  rechazados), reducción a 1200 px, sin ampliar, re-codificación a WebP sin EXIF ni contenido añadido
  (políglota), archivo dañado y tope de píxeles.
- Integración `product-photos.test.ts`: 401/403/400/404, subida y reducción, formatos, archivo no imagen
  renombrado, imagen dañada, 413 por tamaño, un archivo por petición, 6.ª foto (422) y subidas concurrentes,
  lectura con ETag/304/cabeceras seguras (el Vendedor la ve), listados sin bytes, portada única (también en la
  base), reorden con conjunto exacto, borrado con reasignación de portada, auditoría y borrado físico del
  producto con sus fotos. Helpers: `test/helpers/images.ts` (`makeImage`, `multipartPayload`).
- Web (Vitest) `photos.test.tsx` y `photo-files.test.ts`: miniatura con texto alternativo, subida multipart,
  validación previa, errores de la API, límite de 5, galería con y sin permiso y confirmación al eliminar.
- E2E `s3-product-photos.spec.ts`: el Responsable sube (archivo falso rechazado por contenido), marca portada,
  reordena, elimina con confirmación y llega al límite de 5; el Vendedor solo ve y la API le niega la subida.

## Seguridad y endurecimiento (transversal)

- Integración `security-hardening.test.ts`:
  - **Cobertura de autenticación en todas las rutas**: un hook `onRoute` (suscrito al canal
    `fastify.initialization`) enumera cada ruta registrada; sin sesión TODAS responden 401 salvo
    `GET /health` y `POST /auth/login`, y con una sesión sin permisos todas las rutas de negocio responden 403. Una ruta nueva sin guarda hace fallar la prueba.
  - **Producción**: cabeceras de las respuestas JSON (CSP, `frame-ancestors 'none'`, `nosniff`, HSTS, sin
    `x-powered-by`), `Cache-Control: no-store` en la API, cookie `__Host-` con `HttpOnly`, `Secure`,
    `SameSite=Strict` y sin `Domain`, borrado de la cookie con los mismos atributos (también con
    `COOKIE_SECURE=true` fuera de producción) y tiempos de petición/conexión/keep-alive.
  - **CSRF**: `Origin: null`, orígenes ajenos y subida multipart entre orígenes → 403 antes de procesar;
    sin `Origin` se exige igualmente la sesión.
  - **Límites**: login 429 (`RATE_LIMITED`); un `X-Forwarded-For` falsificado **no** evade el límite con
    `TRUST_PROXY_HOPS=0` ni con `=1` (solo cuenta la IP añadida por el proxy propio); `/health` 429 a la
    petición 61.
  - **Sesión por petición**: los cambios de permisos, la desactivación y la revocación rigen en la petición
    siguiente (sin caché); las transacciones toleran más de 5 s.
- Unitarias: `error-handler.test.ts` (P2034, P2028, P2010 con `40P01`/`40001`, error del adaptador y error de
  `pg` → 503 con `Retry-After` y sin detalles internos), `env.test.ts` (`TRUST_PROXY_HOPS`, rechazo del antiguo
  `TRUST_PROXY=true`, avisos de arranque), `dates.test.ts` (`dayRangeLaPaz`, borde 20:00/00:00 de La Paz),
  `sku.test.ts`.
- `users.test.ts`: un rol personalizado con `users:manage` + `roles:manage` no puede asignar, crear con ni
  quitar el rol `ADMIN` (403); el Administrador sí. `cost-visibility.test.ts`: `notes` de los movimientos solo
  con `inventory:adjust`, `stock-entries:read` o `audit:read`, y orden por `id` descendente.

## Qué debe probarse en la Fase 1 (obligatorio)

- Cada endpoint: 401 sin sesión, 403 sin permiso, 400 con datos inválidos, caso feliz.
- **Inventario**: todo cambio de stock genera movimiento; saldo = suma de movimientos; concurrencia
  (dos operaciones simultáneas sobre la misma variante no pierden actualizaciones).
- **Ingresos**: crear/editar borrador no cambia stock; confirmar sí, una sola vez; cancelar confirmado falla.
- **Ajustes** (`adjustments.test.ts`): solicitar no mueve stock; aprobar genera movimiento + saldo + auditoría atómicos; la aprobación **revalida** con el saldo vigente; si una línea falla no se aplica ninguna; concurrencia (dos aprobaciones contra el mismo saldo no dejan stock negativo, doble aprobación del mismo ajuste, orden de bloqueo distinto sin interbloqueo); el Administrador y el Responsable aprueban (regla de autorización compartida, 2026-11-05) y quien solo tiene `inventory:adjust` no, el Vendedor no ve nada; costos ocultos sin `costs:read`; triggers/CHECK de la BD.
- **Precios (ADR-018)**: unitarias de `computeProfit` (Decimal exacto, costo 0, pérdida, redondeo); integración con 401/403/400 en cada endpoint, el Vendedor con 403 y sin costos en ninguna respuesta, el Responsable que aprueba y aplica (regla 2026-11-05) y quien solo tiene `prices:propose` que no, aprobación y rechazo en masa **atómicos**, conflicto por precio anterior desactualizado (409), `ADMIN_DIRECT`, precio inicial `INITIAL`, historial inmutable por trigger, rechazo con comentario obligatorio, auditoría y que ningún otro endpoint cambie `sale_price`; componentes (ganancia en vivo, vistas por rol); E2E `pricing.spec.ts` (solicitud, aprobación en masa, catálogo y Vendedor sin costos; cambio directo; historial).
- **Inventario físico**: snapshot correcto; aprobación genera ajustes exactos por diferencia.
- **Cambios de pieza** (`exchanges.test.ts` en unit e integration, `movements-page.test.tsx`, `stock-exchanges.spec.ts`): 401/403 (también Vendedor y quien solo ajusta)/400/422/404; caso feliz con dos movimientos que comparten `referenceId`, saldos y auditoría; **atomicidad** (la salida sin stock revierte la entrada, sin movimientos ni auditoría); misma variante e inactivas; concurrencia (dos cambios sobre la última unidad: uno 201, otro 422, saldo ≥ 0); sin `costs:read` no hay costos en POST ni GET; los movimientos aparecen en kardex e historial con etiquetas en español y son append-only. El E2E registra el cambio por la API (no hay pantalla) y comprueba el historial.
- **Conteo físico** (`inventory-counts.test.ts`, `count-logic.test.ts`, `stock-counts.spec.ts`): alcance con subcategorías e inactivas con saldo; solapamientos (crear, iniciar y creación simultánea); **ciego** inspeccionando el JSON en captura y recuento (ningún campo de stock ni diferencia, tampoco para quien tiene todos los permisos); escaneo por SKU/código de barras/código de proveedor; hallazgos; operador único y `take`; reanudar tras un nuevo login; sin diferencias → revisión directa y con diferencias → recuento obligatorio; aprobar sin recuento rechazado; **conciliación con un ingreso confirmado durante el conteo**; aprobación atómica, doble aprobación y concurrencia; saldo no negativo (nada cambia); cancelación; costos ocultos sin `costs:read`; inmutabilidad en la BD. La conciliación y la detección de solapamientos son funciones puras con pruebas unitarias.
- **Pendientes de aprobación (Q-14)** (`approvals.test.ts`, E2E `stock-adjustments.spec.ts`): 401 sin sesión; 403 si la persona no puede resolver ningún tipo de pendiente (p. ej. el Vendedor); sin pendientes devuelve ceros y cada total (`adjustments`, `prices`, `counts`) solo se calcula con su permiso (los demás vienen `null`); cuenta ajustes pendientes, cambios de precio pendientes y conteos en revisión. La matriz de permisos (`permissions-matrix.test.ts`) fija la regla de autorización compartida (2026-11-05): `inventory:adjust`, `inventory:adjust-approve`, `inventory:initial-stock`, `inventory-counts:*` e `inventory:exchange` los tienen el Administrador y el Responsable, no el Vendedor (que solo consulta catálogo e inventario), y el Administrador conserva todos los permisos.
- **Ficha incompleta**: `catalog-complete.test.ts` (`isIncomplete` calculado: sin descripción ni características) y `stock-entries.test.ts` (`profileIncomplete` nace en el alta rápida y se limpia con `PATCH /products/:id`); una ficha está incompleta si cualquiera de las dos señales es verdadera.
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
| demo-inventario@example.invalid | Responsable de inventario | Sin Usuarios; crea y edita productos; solicita y aprueba ajustes y precios (autorización) |
| demo-vendedor@example.invalid   | Vendedor                  | Solo consulta; sin Proveedores ni Usuarios                                                |

`apps/web/e2e/roles-and-products.spec.ts` cubre: menú por rol, credenciales incorrectas, redirección al login sin sesión, bloqueo de rutas por permiso en la web **y** en la API (403), y crear → editar → verificar un producto con carga de stock. El sistema no tiene rol «cliente»: el Vendedor es el usuario restringido.

Ejecutar en local: `npm run qa` (todo, con PostgreSQL efímero) o `npm run qa:e2e` (solo E2E). Depurar un fallo: `npx playwright show-trace apps/web/test-results/<carpeta>/trace.zip`.

**Límite de login en E2E.** El login permite 10 intentos por IP cada 15 minutos (`LOGIN_RATE_LIMIT_MAX`). El servidor de E2E lo sube a 1000 porque la suite inicia sesión más de 10 veces; el valor de producción no cambia.

**E2E en serie.** `playwright.config.ts` fija `workers: 1`: todos los archivos comparten una base de datos y un servidor, y los totales del dashboard (`dashboard.spec.ts`) dependen de los datos DEMO sin modificar, por lo que ese archivo debe ejecutarse antes que los que crean productos (orden alfabético).

**Reglas base (S1).** `auth.test.ts` verifica la sesión fija de 8 h (sin extensión por actividad), `users.test.ts` el restablecimiento con clave temporal (401/403/400/feliz, auditoría sin secretos, bloqueo `PASSWORD_CHANGE_REQUIRED`), `database-integrity.test.ts` + `negative-stock-guard.test.ts` el `CHECK (quantity >= 0)` y que la API no filtre detalles internos, `catalog-deactivation.test.ts` la regla P-22, `cost-visibility.test.ts` que el Vendedor no reciba costos y `role-permissions.test.ts` la matriz de roles. E2E: `password-reset.spec.ts` (restablecer → login con temporal → cambio forzado → login normal) y `product-deactivation.spec.ts` (botón deshabilitado con explicación si hay stock).

**Responsive.** `responsive.spec.ts` recorre 22 pantallas en 5 anchos (320, 390, 768, 1024, 1440 px) y falla si la página desborda horizontalmente **o** si algún botón, enlace o campo queda recortado por un contenedor con scroll horizontal (el defecto que el simple «sin scroll de página» no detecta). Las 22 son: Inicio, Productos, Categorías, Atributos, Inventario, Movimientos, Proveedores, Usuarios, Mi cuenta, Ingresos, Nuevo ingreso, Ajustes, Nuevo ajuste, Tipos de costo, Auditoría, Caja, Historial de cajas, Punto de venta, Historial de ventas, Incidencias de venta, Datos del negocio y el detalle de un ingreso. A 320 y 390 px se repite con una tipografía más ancha. **No cubre**, entre otras rutas existentes: Precios, Conteos (lista y detalle), Etiquetas, detalle de producto (`/productos/:id`) ni el detalle de un ajuste.

**Limpieza de la base de integración.** `apps/api/test/helpers/global-setup.ts` vacía la base de pruebas al terminar la suite. Sin esto, las filas del último archivo sobrevivían y alteraban los totales exactos del dashboard cuando `npm run qa` reutilizaba la misma base para los E2E.

**Ventas y caja (web, S5–S8).** Pruebas de componentes (Vitest + Testing Library, sin base de datos): `cash-math.test.ts` (importes con coma o punto en centavos, diferencia con signo, observación obligatoria, vista previa de correcciones), `cash-close-page.test.tsx` (diferencia anunciada con `aria-live`, observación obligatoria, confirmación accesible, doble clic → una petición, reintento tras corte de red con la **misma** `Idempotency-Key`, `CASH_DIFFERENCE_NOTE_REQUIRED` con clave nueva), `cash-page.test.tsx` (apertura con cero explícito, permisos de caja, «Corregida (N)»), `cart.test.ts` y `payments.test.ts` (carrito, topes de stock, total, vuelto, falta, pagos mixtos, borrador en `sessionStorage`), `pos-page.test.tsx` (lector texto + Enter, foto junto al nombre, revisión obligatoria con el aviso de no anulación, clave guardada en `sessionStorage` y reutilizada en «Resultado incierto» incluso tras recargar, clave nueva tras `PRICE_CHANGED`/`INSUFFICIENT_STOCK`, caja cerrada), `receipt-settings.test.ts` y `receipt-page.test.tsx` (`@page` por formato, A4 por defecto y recordado, registro antes de imprimir, «COPIA», sin costos ni referencias), `sales-history.test.tsx` (historial, detalle sin acciones de anulación, incidencias) y `business-settings-page.test.tsx`. E2E con datos propios (piezas «E2E Venta …» en «DEMO Anillos», nunca las DEMO) y la caja siempre cerrada al empezar: `sales-admin.spec.ts` (datos del negocio en el comprobante, corrección de un cierre, cierre de una incidencia sin cambios en venta ni stock), `sales-cashier.spec.ts` (Responsable: abre caja → venta mixta QR + efectivo con vuelto → comprobante 80 mm con `window.print` simulado y `emulateMedia(print)` → «COPIA» tras recargar → cierre con faltante y observación), `sales-last-piece.spec.ts` (dos personas y una pieza única: una venta, la otra recibe stock insuficiente, saldo 0) y `sales-seller.spec.ts` (Vendedor sin caja: no vende ni abre; luego vende, solo ve sus ventas —404 en la ajena— y reporta una incidencia que no puede listar). Los archivos `sales-*` corren después de `dashboard.spec.ts` (orden alfabético). Ejecutar: `npm run qa -- e2e sales-admin.spec.ts sales-cashier.spec.ts sales-last-piece.spec.ts sales-seller.spec.ts`.

**Ingresos v2 (importación).** `costing.test.ts` verifica la conversión USD→Bs (redondeo a 4 decimales antes de multiplicar, valores límite, desborde) y, en 500 casos aleatorios con tipo de cambio, que la suma de los repartos es exactamente el total de costos adicionales; `dates.test.ts`, el rango de la fecha del documento en `America/La_Paz`. `stock-entries.test.ts` cubre además moneda y tipo de cambio (400 sin él en USD, `CHECK` en base), lista de costos, diferencias sin justificar, fecha fuera de rango, alta rápida (atómica y auditada, código de proveedor repetido), historial de costos, tipos de costo (`settings:manage`) y que sin `costs:read` ninguna respuesta trae costos. `stock-entries-import.spec.ts` (E2E) recorre el flujo de importación completo. La migración de datos (columnas fijas → líneas) se verificó manualmente aplicando las migraciones sobre una base con ingresos antiguos (borrador y confirmado); no tiene prueba automática porque `prisma migrate deploy` solo parte de una base vacía.

**Conteo físico.** `stock-counts.spec.ts` (E2E) recorre el flujo completo con el lector simulado (teclear el código + Enter) sobre «DEMO Aretes» con tres usuarios: el Responsable crea, captura (con deshacer, cantidades a mano y hallazgos) y cierra; el Administrador no puede capturar hasta tomar el conteo y hace el segundo recuento; el Vendedor no puede verlo ni aprobarlo (web y API); el Responsable regulariza un hallazgo y aprueba, y se comprueban el stock y el historial de movimientos. **Modifica el stock de DEMO Aretes**, por lo que corre después de `dashboard.spec.ts` (orden alfabético, `workers: 1`).

**Ingresos de mercadería.** `stock-entries.test.ts` (API) cubre permisos, borrador sin efecto en el stock, reparto, confirmación única, concurrencia (dos confirmaciones simultáneas e ingresos distintos sobre la misma variante), reversión completa ante un fallo, y `costing.test.ts` verifica en 500 casos aleatorios que la suma de las partes es exactamente el total. Se comprobó con **mutantes** que estas pruebas fallan si se quitan los bloqueos de fila. `stock-entries.spec.ts` (E2E) **modifica el stock de dos variantes DEMO**, por lo que debe correr después de `dashboard.spec.ts` y `responsive.spec.ts` (orden alfabético, `workers: 1`).

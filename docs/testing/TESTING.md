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

## Catálogo (S2)

- `catalog-complete.test.ts`: atributos y valores, categorías de dos niveles, características y ejes al crear,
  códigos repetidos (Q-10), búsqueda unificada, ficha incompleta/sin precio, eliminación física (B11) por cada causa.
- Web (Vitest): `code128.test.ts` (codificación y ancho), `label-settings.test.ts` (tamaños, localStorage y CSS
  `@page`), `label.test.tsx`, `labels-page.test.tsx`, `product-badges.test.tsx`, `attribute-values.test.ts`.
- E2E `s2-catalog-complete.spec.ts`: el Responsable crea un producto con atributos y variantes, imprime la vista
  previa de etiquetas (estilo `@page` y SVG), el Administrador elimina una ficha sin movimientos y el Vendedor
  solo consulta. La vista de impresión se verifica con `page.emulateMedia({ media: 'print' })`.

## Qué debe probarse en la Fase 1 (obligatorio)

- Cada endpoint: 401 sin sesión, 403 sin permiso, 400 con datos inválidos, caso feliz.
- **Inventario**: todo cambio de stock genera movimiento; saldo = suma de movimientos; concurrencia
  (dos operaciones simultáneas sobre la misma variante no pierden actualizaciones).
- **Ingresos**: crear/editar borrador no cambia stock; confirmar sí, una sola vez; cancelar confirmado falla.
- **Inventario físico**: snapshot correcto; aprobación genera ajustes exactos por diferencia.
- Auditoría escrita en la misma transacción (si la operación falla, no queda auditoría huérfana).

## E2E — primera vez

```bash
npx playwright install chromium   # descarga el navegador (una vez por equipo)
npm run qa:e2e                   # crea BD efímera y servidores exclusivos
```

## Datos de demostración y E2E por roles

`npm run db:seed:demo` (antes `npm run db:seed`) crea datos **ficticios** marcados «DEMO»: 3 usuarios (uno por rol, contraseña `DEMO_USER_PASSWORD`), 4 categorías y 20 productos con stock variado (5 sin stock, 5 bajo mínimo, 10 disponibles). El stock entra como movimientos `INITIAL_STOCK` auditados, nunca editando saldos. Se niega a correr con `NODE_ENV=production` o contra una base que no sea local. `npm run qa` lo ejecuta automáticamente.

| Usuario DEMO                    | Rol                       | Qué prueba                                                 |
| ------------------------------- | ------------------------- | ---------------------------------------------------------- |
| demo-admin@example.invalid      | Administrador             | Todo el menú; carga de stock inicial                       |
| demo-inventario@example.invalid | Responsable de inventario | Sin Usuarios; crea/edita productos; sin `inventory:adjust` |
| demo-vendedor@example.invalid   | Vendedor                  | Solo consulta; sin Proveedores ni Usuarios                 |

`apps/web/e2e/roles-and-products.spec.ts` cubre: menú por rol, credenciales incorrectas, redirección al login sin sesión, bloqueo de rutas por permiso en la web **y** en la API (403), y crear → editar → verificar un producto con carga de stock. El sistema no tiene rol «cliente»: el Vendedor es el usuario restringido.

Ejecutar en local: `npm run qa` (todo, con PostgreSQL efímero) o `npm run qa:e2e` (solo E2E). Depurar un fallo: `npx playwright show-trace apps/web/test-results/<carpeta>/trace.zip`.

**Límite de login en E2E.** El login permite 10 intentos por IP cada 15 minutos (`LOGIN_RATE_LIMIT_MAX`). El servidor de E2E lo sube a 1000 porque la suite inicia sesión más de 10 veces; el valor de producción no cambia.

**E2E en serie.** `playwright.config.ts` fija `workers: 1`: todos los archivos comparten una base de datos y un servidor, y los totales del dashboard (`dashboard.spec.ts`) dependen de los datos DEMO sin modificar, por lo que ese archivo debe ejecutarse antes que los que crean productos (orden alfabético).

**Reglas base (S1).** `auth.test.ts` verifica la sesión fija de 8 h (sin extensión por actividad), `users.test.ts` el restablecimiento con clave temporal (401/403/400/feliz, auditoría sin secretos, bloqueo `PASSWORD_CHANGE_REQUIRED`), `database-integrity.test.ts` + `negative-stock-guard.test.ts` el `CHECK (quantity >= 0)` y que la API no filtre detalles internos, `catalog-deactivation.test.ts` la regla P-22, `cost-visibility.test.ts` que el Vendedor no reciba costos y `role-permissions.test.ts` la matriz de roles. E2E: `password-reset.spec.ts` (restablecer → login con temporal → cambio forzado → login normal) y `product-deactivation.spec.ts` (botón deshabilitado con explicación si hay stock).

**Responsive.** `responsive.spec.ts` recorre 9 pantallas en 5 anchos (320, 390, 768, 1024, 1440 px) y falla si la página desborda horizontalmente **o** si algún botón, enlace o campo queda recortado por un contenedor con scroll horizontal (el defecto que el simple «sin scroll de página» no detecta).

**Limpieza de la base de integración.** `apps/api/test/helpers/global-setup.ts` vacía la base de pruebas al terminar la suite. Sin esto, las filas del último archivo sobrevivían y alteraban los totales exactos del dashboard cuando `npm run qa` reutilizaba la misma base para los E2E.

**Ingresos de mercadería.** `stock-entries.test.ts` (API) cubre permisos, borrador sin efecto en el stock, reparto, confirmación única, concurrencia (dos confirmaciones simultáneas e ingresos distintos sobre la misma variante), reversión completa ante un fallo, y `costing.test.ts` verifica en 500 casos aleatorios que la suma de las partes es exactamente el total. Se comprobó con **mutantes** que estas pruebas fallan si se quitan los bloqueos de fila. `stock-entries.spec.ts` (E2E) **modifica el stock de dos variantes DEMO**, por lo que debe correr después de `dashboard.spec.ts` y `responsive.spec.ts` (orden alfabético, `workers: 1`).

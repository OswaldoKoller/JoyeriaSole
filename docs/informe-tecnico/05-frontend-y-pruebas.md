# 05 · Frontend, pruebas y calidad

> Informe técnico de «Joyería Sole». Parte 05 de 06. Estado verificado el **2026-11-07** sobre la rama
> `feature/f1-productos-detalle` (ya integrada en `main`), leyendo el código de `apps/web`, `apps/api/test`,
> `apps/web/e2e` y `.github/workflows/ci.yml`.
>
> **Método y alcance de las cifras.** Los conteos de líneas, archivos, rutas y permisos salen de `wc`/`grep` sobre el
> código. El número de pruebas de la API y de la web se contrastó con la salida de Vitest del CI remoto (ejecución
> `release: integrar la Fase 1 a main`, 2026-11-06): **490** (API) y **209** (web) coinciden con el recuento por
> archivo. El de E2E (**59**) sale de `playwright test --list`. Los tamaños de _bundle_ se midieron con
> `vite build` hacia una carpeta temporal (no toca `apps/web/dist`). Los tiempos de CI son los reales de GitHub
> Actions (`gh run view`). **No se ejecutó ninguna suite** para este informe. Todo lo que es juicio u
> hipótesis se marca como tal.

---

## Resumen ejecutivo

| Dimensión           | Estado                                                                                                             | Dato clave                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Tamaño del frontend | 77 archivos `.tsx` y 36 `.ts` en `src/` (sin pruebas); 20 252 líneas con pruebas                                   | 12 áreas en `src/features/`                                                                        |
| Rutas               | 23 rutas internas + login + comodín                                                                                | **20 de 23 rutas internas son perezosas** (`lazyPage`)                                             |
| Carga inicial       | **530 kB / ≈162 kB gzip** de JS + 40,8 kB / 8,3 kB de CSS                                                          | Antes de dividir por rutas era 1 chunk de ≈851 kB (≈224 kB gzip, medición previa del equipo)       |
| Caché de datos      | `staleTime` 30 s, referencia 5 min, `gcTime` 10 min, 401 global                                                    | Una sola `QueryClient` con `QueryCache.onError`                                                    |
| Pruebas totales     | **758** (490 API + 209 web + 59 E2E)                                                                               | 3 niveles + BD real (PostgreSQL 18)                                                                |
| CI                  | `quality` ≈ 14–20 min (con E2E), `docker` ≈ 3,7 min                                                                | **Última ejecución en `main` (PR #7): FALLÓ** por E2E intermitente (`s2-catalog-complete.spec.ts`) |
| Deuda principal     | 10 `window.confirm`, `VariantPicker` duplicado, 8 archivos > 400 líneas, `/cover` sin caché fuerte, sin miniaturas | Estimación total ≈ 20–26 días-persona (sección 7)                                                  |

---

## 1. Stack y estructura de `apps/web`

### 1.1 Stack (versiones de `apps/web/package.json`)

| Capa              | Tecnología                                                                            | Versión         | Notas                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| UI                | React + React DOM                                                                     | ^19.3.0         | `StrictMode` activo en `main.tsx`                                                                 |
| Build/dev         | Vite + `@vitejs/plugin-react`                                                         | ^8.3.3 / ^6.1.2 | `sourcemap: false` en producción (evita publicar mapas sin autenticación)                         |
| Estilos           | Tailwind CSS + `@tailwindcss/vite`                                                    | ^4.3.3          | Sin `tailwind.config`: tokens en `@theme` de `src/index.css` (`brand-50/100/200/500/600/700/800`) |
| Datos             | `@tanstack/react-query`                                                               | ^5.104.1        | Sin estado global manual                                                                          |
| Rutas             | `react-router`                                                                        | ^8.4.0          | `createBrowserRouter` (data router)                                                               |
| Contratos         | `@joyeria/shared`                                                                     | workspace       | Permisos, códigos de error, esquemas Zod, tipos de DTO                                            |
| Validación        | `zod`                                                                                 | ^4.6.5          | Se usa vía `@joyeria/shared`; esquema propio solo en `label-settings.ts`                          |
| Íconos            | `lucide-react`                                                                        | ^1.55.0         | Solo en `app-shell`, `dashboard/*` y `audit-detail`                                               |
| Códigos de barras | `jsbarcode`                                                                           | ^3.12.3         | Solo en el chunk de Etiquetas; se usa en modo «objeto» (el SVG lo dibuja React)                   |
| Pruebas           | Vitest ^5.0.3, Testing Library (react 16.3, user-event 14.6, jest-dom 7), jsdom ^30.1 |                 | Playwright ^1.63 para E2E                                                                         |

El proxy de desarrollo (`vite.config.ts`) reenvía `/api` a `API_PROXY_TARGET` (por defecto `http://localhost:3000`)
para que el navegador vea un solo origen, igual que en producción (cookies `SameSite=Strict` sin CORS).

### 1.2 Árbol de carpetas

```
apps/web/
├── index.html                 lang="es", robots noindex/nofollow, favicon.svg (public/)
├── vite.config.ts             plugins react+tailwind, proxy /api, build.sourcemap=false, bloque `test`
├── playwright.config.ts       E2E: serie, 1 worker, servidores propios (API :3001, web :5174)
├── tsconfig.json              extiende tsconfig.base.json; incluye src, e2e y configs
├── e2e/                       18 specs + product-pages.ts (helpers)
└── src/
    ├── main.tsx               QueryClientProvider + RouterProvider
    ├── index.css              @import tailwind, @theme, estilos de `table-cards` (container query)
    ├── app/                   router.tsx, lazy-page.tsx, app-shell.tsx, query-client.ts, route-error.tsx (+ 4 pruebas)
    ├── components/ui/         button, input, pagination, skeleton, page-loading, full-page-message (+ 2 pruebas)
    ├── features/<área>/       12 áreas: páginas, componentes y hooks de datos (sección 3)
    ├── lib/                   api-client.ts, paging.ts, format.ts, use-document-title.ts
    ├── pages/                 not-found-page.tsx (única página genérica)
    └── test/                  setup.ts, render.tsx (renderWithProviders, jsonResponse)
```

### 1.3 Convenciones y alias

| Aspecto                   | Realidad en el código                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Alias de importación**  | **No hay alias** (`@/…`). Todo es relativo con **extensión `.ts`/`.tsx`** (`import { x } from './x.ts'`), exigido por `CLAUDE.md`. |
| Nombres                   | Archivos `kebab-case`; componentes `PascalCase`; hooks `use-<área>.ts` con claves de consulta propias                              |
| Idioma                    | Identificadores en inglés; textos de interfaz, comentarios y documentación en español                                              |
| TypeScript                | Estricto; sin `any` ni `dangerouslySetInnerHTML` en `src/` (verificado con `grep`); sin `eslint-disable`                           |
| ESLint                    | `strictTypeChecked` + `react-hooks` + `react-refresh`, `--max-warnings 0`                                                          |
| Estructura de una feature | `<área>-page.tsx` (ruta) + componentes + `use-<área>.ts` (queries/mutations) + `*.test.tsx`                                        |
| Un hook de datos por área | Las funciones `fetch` no se llaman fuera de `lib/api-client.ts`; las pantallas solo usan los hooks                                 |
| Estado de URL             | Productos, Auditoría y los accesos desde otras pantallas (`?estado=`, `?tab=`, `?sku=`, `?codes=`) usan la URL (ver 4.8)           |

---

## 2. Mapa de rutas

Fuente: `src/app/router.tsx` (230 líneas) y `src/app/app-shell.tsx` (menú).

**Mecánica.**

- La ruta `/` está envuelta en `<RequireAuth><AppShell/></RequireAuth>` (sesión obligatoria; si
  `mustChangePassword`, ninguna otra pantalla hasta cambiar la clave).
- Cada ruta perezosa vuelve a envolverse con `lazyPage(loader, guard)`, que añade `RequireAuth` con los permisos de la
  ruta + `Suspense` con `PageLoading` (`role="status"`, `aria-live="polite"`). La sección **no se descarga hasta que
  sesión y permisos lo permiten**.
- Hay un `errorElement` (`RouteError`) en el nivel raíz, en la ruta `/login` y en un «grupo sin ruta» que contiene todas
  las secciones: un fallo en una pantalla no tumba el panel lateral.
- `RequireAuth` admite `permissions` (**todos**) y `anyPermissions` (**al menos uno**).

| #   | Ruta                            | Permiso requerido (UX; la API valida)             | Pantalla / componente                                     | Carga                                    | Cuelga del menú (grupo → entrada)                                                                                                              |
| --- | ------------------------------- | ------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/login`                        | — (pública; si hay sesión redirige a `from`)      | `LoginPage`                                               | **Eager**                                | —                                                                                                                                              |
| 2   | `/` (índice)                    | sesión                                            | `DashboardPage`                                           | **Eager**                                | General → Inicio                                                                                                                               |
| 3   | `/mi-cuenta`                    | sesión                                            | `AccountPage` (`ChangePasswordForm`)                      | **Eager**                                | Acceso → Mi cuenta                                                                                                                             |
| 4   | `/proveedores`                  | `suppliers:read`                                  | `SuppliersPage`                                           | Lazy                                     | Compras → Proveedores                                                                                                                          |
| 5   | `/usuarios`                     | `users:read`                                      | `UsersPage`                                               | Lazy                                     | Acceso → Usuarios                                                                                                                              |
| 6   | `/categorias`                   | `catalog:read`                                    | `CategoriesPage`                                          | Lazy                                     | Catálogo → Categorías                                                                                                                          |
| 7   | `/atributos`                    | `catalog:read`                                    | `AttributesPage`                                          | Lazy                                     | Catálogo → Atributos                                                                                                                           |
| 8   | `/productos`                    | `catalog:read`                                    | `ProductsPage`                                            | Lazy                                     | Catálogo → Productos                                                                                                                           |
| 9   | `/productos/:id`                | `catalog:read`                                    | `ProductDetailPage`                                       | Lazy                                     | Sin entrada propia; cuelga de Productos (tarjeta)                                                                                              |
| 10  | `/catalogo/etiquetas`           | `catalog:read`                                    | `LabelsPage`                                              | Lazy (74,9 kB, el único con `jsbarcode`) | Catálogo → Etiquetas (también botón en Productos)                                                                                              |
| 11  | `/precios`                      | cualquiera de `prices:propose` / `prices:approve` | `PricingPage` (pestañas Precios · Pendientes · Historial) | Lazy                                     | Catálogo → Precios (`anyOf`)                                                                                                                   |
| 12  | `/inventario`                   | `inventory:read`                                  | `InventoryPage`                                           | Lazy                                     | Inventario → Saldos y alertas; **y** Inventario → Stock inicial (`?accion=inicial`, requiere además `inventory:initial-stock` solo en el menú) |
| 13  | `/inventario/movimientos`       | `inventory:read`                                  | `MovementsPage`                                           | Lazy                                     | Inventario → Movimientos                                                                                                                       |
| 14  | `/inventario/ajustes`           | `inventory:adjust`                                | `AdjustmentsPage`                                         | Lazy                                     | Inventario → Ajustes                                                                                                                           |
| 15  | `/inventario/ajustes/nuevo`     | `inventory:adjust` **y** `inventory:read`         | `AdjustmentNewPage`                                       | Lazy                                     | Botón en Ajustes (y «Ajustar a cero» desde Inventario con `?sku=&cero=1`)                                                                      |
| 16  | `/inventario/ajustes/:id`       | `inventory:adjust`                                | `AdjustmentPage`                                          | Lazy                                     | Detalle desde Ajustes / bandeja del Inicio                                                                                                     |
| 17  | `/inventario/conteos`           | `inventory-counts:read`                           | `CountsPage`                                              | Lazy                                     | Inventario → Conteo físico                                                                                                                     |
| 18  | `/inventario/conteos/:id`       | `inventory-counts:read`                           | `CountPage` → `CaptureScreen` / `ReviewScreen`            | Lazy                                     | Detalle desde Conteos                                                                                                                          |
| 19  | `/ingresos`                     | `stock-entries:read`                              | `StockEntriesPage`                                        | Lazy                                     | Compras → Ingresos de mercadería                                                                                                               |
| 20  | `/ingresos/nuevo`               | `stock-entries:manage`                            | `StockEntryNewPage`                                       | Lazy                                     | Botón en Ingresos                                                                                                                              |
| 21  | `/ingresos/:id`                 | `stock-entries:read`                              | `StockEntryPage`                                          | Lazy                                     | Detalle desde Ingresos                                                                                                                         |
| 22  | `/configuracion/tipos-de-costo` | `settings:manage` **y** `stock-entries:read`      | `CostTypesPage`                                           | Lazy                                     | Compras → Tipos de costo (el menú pide solo `settings:manage`)                                                                                 |
| 23  | `/auditoria`                    | `audit:read`                                      | `AuditPage` (+ `AuditDetailDialog`)                       | Lazy                                     | Acceso → Auditoría                                                                                                                             |
| 24  | `*`                             | —                                                 | `NotFoundPage`                                            | **Eager**                                | —                                                                                                                                              |

Recuento: **24 entradas** (login, 22 internas incluido el índice, comodín). Eager: 4 (`/login`, `/`, `/mi-cuenta`, `*`) más
el `AppShell`. Lazy: **20**.

**Menú lateral (`app-shell.tsx`, 391 líneas).** 6 grupos y 19 entradas:

| Grupo      | Entradas                                                             | Filtro de visibilidad                                                                       |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| General    | Inicio                                                               | siempre                                                                                     |
| Catálogo   | Productos, Precios, Categorías, Atributos, Etiquetas                 | `permission` o `anyOf`                                                                      |
| Inventario | Saldos y alertas, Movimientos, Stock inicial, Ajustes, Conteo físico | `permission`                                                                                |
| Compras    | Proveedores, Ingresos de mercadería, Tipos de costo                  | `permission`                                                                                |
| Acceso     | Usuarios, Auditoría, Mi cuenta                                       | `permission` (Mi cuenta: ninguno)                                                           |
| Ventas     | Punto de venta, Historial de ventas, Devoluciones                    | **Sin enlace ni permiso**: se muestran a todo usuario como «Próximamente» (`aria-disabled`) |

Comportamientos del menú: panel fijo desde `lg` y cajón deslizable en móvil (con Escape, foco al botón cerrar, telón
que cierra); «Saltar al contenido»; `aria-current="page"` en la entrada activa; la entrada «Saldos y alertas» deja
de estar activa cuando `?accion=inicial` está presente (para que «Stock inicial» sea la activa); al cambiar de ruta el
foco pasa al `<main tabIndex={-1}>`, **salvo** que la pantalla ya haya enfocado un campo propio (lector de códigos).

**Desajustes observados entre menú y router** (solo UX, la API valida): «Tipos de costo» y «Stock inicial» exigen en el
menú un permiso distinto del de la ruta; «Etiquetas» y «Precios» comparten el ícono `Tag`.

---

## 3. Catálogo de features

Convenciones de lectura de las tablas: _staleTime_ «30 s» es el **valor por defecto global** (no se fija en el hook);
«5 min» viene de `REFERENCE_DATA_KEYS` en `query-client.ts` o del propio hook. «Invalida» indica lo que cada mutación
refresca. `useListQuery` = lista paginada con `placeholderData: keepPreviousData` (no desmonta la tabla ni el foco).

### 3.1 Resumen de tamaño por feature

| Feature                     | Archivos `.tsx` | Archivos `.ts` | Líneas (sin pruebas) | Archivos de prueba |
| --------------------------- | --------------- | -------------- | -------------------- | ------------------ |
| `catalog` (incl. `photos/`) | 17              | 11             | 4 463                | 15                 |
| `stock-entries`             | 11              | 3              | 2 602                | 1                  |
| `inventory-counts`          | 5               | 2              | 1 429                | 1                  |
| `pricing`                   | 7               | 2              | 1 322                | 1                  |
| `adjustments`               | 4               | 2              | 1 258                | 2                  |
| `audit`                     | 2               | 4              | 947                  | 2                  |
| `dashboard`                 | 5               | 1              | 784                  | 1                  |
| `users`                     | 3               | 1              | 639                  | 0                  |
| `suppliers`                 | 2               | 1              | 593                  | 1                  |
| `inventory`                 | 2               | 1              | 467                  | 1                  |
| `auth`                      | 5               | 1              | 327                  | 2                  |
| `approvals`                 | 1               | 1              | 81                   | 0                  |

(Conteos con `find`/`wc`; los archivos grandes se detallan en 3.3. Fuera de `features/` hay 9 `.tsx` y 5 `.ts` en `app/`, `components/ui/`, `lib/`, `pages/` y `main.tsx`.)

### 3.2 Fichas por feature

#### `auth` — sesión

| Elemento              | Detalle                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pantallas             | `LoginPage` (`/login`), `AccountPage` (`/mi-cuenta`), `ForcedPasswordChange` (se interpone si `mustChangePassword`)                                                                                                                                                                                                                                                                                        |
| Hooks (`use-auth.ts`) | `useCurrentUser` (`['auth','me']`, `GET /auth/me`, **staleTime 5 min**; un 401 se convierte en `null`), `useHasPermission(...perms)`, `useLogin` (`POST /auth/login`, invalida `auth/me`), `useLogout` (`POST /auth/logout`; en `onSettled` pone `me=null` y **elimina todas las consultas excepto `auth`**), `useChangePassword` (`POST /auth/change-password`, igual limpieza: obliga a volver a entrar) |
| Componentes           | `RequireAuth`, `ChangePasswordForm`                                                                                                                                                                                                                                                                                                                                                                        |
| Esquemas compartidos  | `loginSchema`, `changePasswordSchema`                                                                                                                                                                                                                                                                                                                                                                      |
| Permisos de UI        | `RequireAuth` (todos/alguno) y `useHasPermission`                                                                                                                                                                                                                                                                                                                                                          |

#### `dashboard` — Inicio

| Elemento                                | Detalle                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pantalla                                | `DashboardPage`                                                                                                                                                                                        |
| Hooks (`use-dashboard.ts`)              | `useStockSummary` = **3 consultas** `['inventory','dashboard','count',level]` (`/inventory?pageSize=1&level=all                                                                                        | OUT | OK`, usa solo `meta.total`; «bajo mínimo» = total − sin stock − disponibles); `useAttentionItems`= **2 consultas**`['inventory','dashboard','items','OUT' | 'LOW']`con`pageSize=100`; staleTime 30 s (explícito). Las claves empiezan por `inventory`, así que un stock inicial las refresca |
| Componentes                             | `StatCard`, `StockDonut` (SVG propio), `AttentionTable` (310 líneas, ordenable, `aria-sort`, tarjetas en móvil), `CatalogHealthNotice` (`GET /products/health`), `PendingApprovals` (de `approvals`)   |
| Formularios                             | Ninguno                                                                                                                                                                                                |
| Permisos de UI                          | Sin `inventory:read`: solo saludo. `CatalogHealthNotice` enlaza con `catalog:manage`. `PendingApprovals` solo con alguno de `inventory:adjust-approve` / `prices:approve` / `inventory-counts:approve` |
| Peticiones al montar (usuario con todo) | **7**: 3 conteos + 2 listas de hasta 100 + `approvals/pending` + `products/health`                                                                                                                     |

#### `approvals`

`usePendingApprovals(enabled)`: `['approvals','pending']`, `GET /approvals/pending`, staleTime 30 s,
`refetchOnWindowFocus: true` (único hook que lo activa). Se invalida desde ajustes, conteos y precios.

#### `catalog` — productos, variantes, categorías, atributos, etiquetas, fotos

| Elemento                       | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pantallas                      | `ProductsPage` (tarjetas), `ProductDetailPage` (ficha completa), `CategoriesPage`, `AttributesPage`, `LabelsPage`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Hooks `use-products.ts`        | `useProducts(filters)` `['products', filters]` (`GET /products`, lista paginada). `useProduct(id)` `['products','detail',id]` (`GET /products/:id`; **`initialData` tomado de cualquier listado en caché** con su `dataUpdatedAt`: si es reciente no hay petición). `useCatalogHealth` `['products','health']`. Funciones sueltas `lookupVariant(code)` (`GET /catalog/variants/lookup`) y `searchCatalog(term)`. Mutaciones: `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`, `useUpdateVariantStatus`, `useUpdateVariant` (también invalida `inventory`), `useAssignBarcode`, `useGenerateBarcode`, `useConfigureAxes`, `useCreateVariant` |
| Invalidación                   | `useRefreshProducts`: la ficha devuelta por la API se escribe con `setQueryData` en el detalle (sin volver a pedirla) y el resto de `['products', …]` se marca como viejo. `useDeleteProduct`: `removeQueries` del detalle + invalida `products` e `inventory`                                                                                                                                                                                                                                                                                                                                                                                          |
| `use-categories.ts`            | `['categories']` (`GET /categories`, **5 min**); 3 mutaciones que solo invalidan `categories`. Helpers `categoryPath`, `effectiveCategoryAttributes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `use-attributes.ts`            | `['attributes',{includeInactive}]` (**5 min**); 4 mutaciones que invalidan `attributes` y `products`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `photos/use-product-photos.ts` | `useUploadProductPhoto` (multipart `POST /products/:id/photos`), `useSetCoverPhoto`, `useReorderPhotos`, `useDeletePhoto`; todas invalidan `['products']`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Componentes                    | `ProductCard` (`memo`), `ProductForm` (489 l.), `VariantRow` (287 l.), `ConfigureAxesForm`/`CreateVariantForm` (`variant-forms.tsx`, 278 l.), `AttributeFields`, `ProductBadges`, `ProductPrice`, `LabelPage`/`LabelBarcode`/`LabelPrintArea` (`label.tsx`), `PhotoGallery` (192 l.), `PhotoUploader`, `ProductThumb`, `PieceImage`                                                                                                                                                                                                                                                                                                                     |
| Lógica pura con prueba         | `product-summary.ts` (`availability`, `priceLabel`, `productStock`), `code128.ts`, `label-settings.ts`, `attribute-values.ts`, `photo-files.ts`, `photo-url.ts`, `stock-messages.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Esquemas compartidos           | `createProductSchema`/`updateProductSchema`, `configureAxesSchema`, `createVariantSchema`, `createAttributeSchema`, `createAttributeOptionSchema`, `createCategorySchema`/`updateCategorySchema`; `PHOTO_UPLOAD_TYPES`, `MAX_PHOTO_UPLOAD_BYTES`. **Esquema local**: `labelSizeSchema` (tamaño de etiqueta; la API no interviene)                                                                                                                                                                                                                                                                                                                       |
| Permisos de UI                 | `catalog:manage` (crear/editar/variantes/atributos/categorías/fotos), `catalog:delete` (eliminar ficha), `inventory:read` (stock y disponibilidad en tarjeta y ficha), `prices:propose`/`prices:approve` y `costs:read` (precio en `VariantRow`), `suppliers:read` (selector de proveedor)                                                                                                                                                                                                                                                                                                                                                              |
| Estados                        | Cargando / vacío / error con «Reintentar» en lista y ficha; la ficha distingue 404 («no existe o fue eliminado») de otros errores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

#### `inventory` — saldos y movimientos

| Elemento                 | Detalle                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pantallas                | `InventoryPage` (309 l.: saldos, filtro de nivel, historial por variante, stock inicial inline), `MovementsPage` (97 l.: kardex global)                                                                                                                                                                                |
| Hooks `use-inventory.ts` | `useInventory(page,q,level,initialOnly)` `['inventory',…]`; `useAllInventoryMovements(page)` `['inventory-movements','all',page]`; `useInventoryMovements(variantId)` `['inventory-movements',variantId]`; `useInitialStock` (`POST /inventory/:id/initial`, invalida `inventory`, `inventory-movements` y `products`) |
| Esquema compartido       | `initialStockSchema`; `movementTypeLabel` (etiquetas en español)                                                                                                                                                                                                                                                       |
| Permisos de UI           | `inventory:adjust` (botón «Ajustar a cero»), `inventory:initial-stock`                                                                                                                                                                                                                                                 |
| Estado                   | Página, búsqueda y nivel en estado local de React (**no** en la URL)                                                                                                                                                                                                                                                   |

#### `adjustments` — ajustes con solicitud y aprobación

| Elemento         | Detalle                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pantallas        | `AdjustmentsPage` (lista y filtros), `AdjustmentNewPage` (417 l.; buscador de variantes con lector), `AdjustmentPage` (detalle, aprobar/rechazar/cancelar)                                                                                                                                                                                          |
| Hooks            | `useAdjustments(filters)` `['adjustments','list',filters]`; `useAdjustment(id)` `[…,'detail',id]`; `useAdjustmentReasons` (**5 min**); `usePendingAdjustmentsCount` `[…,'pending-count']`; `useCreateAdjustment`, `useCancel/Approve/RejectAdjustment`; `searchInventory`/`useInventorySearch` (`GET /inventory?q=…`, `enabled` con ≥ 2 caracteres) |
| Invalidación     | `useAfterChange`: `setQueryData` del detalle + invalida listas, contador y `approvals`; con efecto en stock (aprobar) además `inventory`, `inventory-movements` y `products`                                                                                                                                                                        |
| Esquema / lógica | `createAdjustmentSchema` vía `adjustment-form.ts` (con prueba)                                                                                                                                                                                                                                                                                      |
| Permisos de UI   | `inventory:adjust-approve` (aprobar/rechazar), `costs:read` (columna Valor)                                                                                                                                                                                                                                                                         |

#### `inventory-counts` — conteo físico a ciegas

| Elemento         | Detalle                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pantallas        | `CountsPage` (lista, alta por categoría), `CountPage` (despacha por estado) → `CaptureScreen` (483 l.) y `ReviewScreen` (401 l.)                                                                                                                                                                                                                                  |
| Hooks            | `useInventoryCounts(filters)`, `useInventoryCount(id)`, `useCreateInventoryCount`, `useCountTransition(id, start/take/close/approve)`, `useCancelInventoryCount`, `useScanMutations` (scan, undo, setQuantity, noteFinding: tras cada una **invalida el detalle**), `useRegularizeFinding`. Claves `['inventory-counts', 'list'                                   | 'detail', …]` |
| Particularidades | Captura **a ciegas**: la UI jamás muestra stock del sistema; el campo de lectura (`min-h-12`) recupera el foco tras cada lectura y al perderlo; el botón de envío **nunca se deshabilita** (un botón deshabilitado bloquea el Enter del lector y se perderían lecturas rápidas); pitido (`AudioContext`) + destello + foto de la pieza leída + región `aria-live` |
| Permisos de UI   | `inventory-counts:manage`, `inventory-counts:approve` (aprobar en revisión)                                                                                                                                                                                                                                                                                       |

#### `stock-entries` — ingresos de mercadería (importación)

| Elemento                     | Detalle                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pantallas                    | `StockEntriesPage`, `StockEntryNewPage` (49 l.), `StockEntryPage` (409 l.: borrador editable, confirmar, cancelar), `CostTypesPage`                                                                                                                                                                  |
| Componentes                  | `StockEntryHeaderForm` (proveedor, documento, moneda USD/Bs, tipo de cambio), `StockEntryItems` (320 l., incluye `VariantPicker` propio), `StockEntryCosts` (costos adicionales), `QuickCreatePiece` (alta rápida de pieza con `PhotoUploader`), `CostPanel` y `CostHistory` (solo con `costs:read`) |
| Hooks `use-stock-entries.ts` | `['stock-entries','list'                                                                                                                                                                                                                                                                             | 'detail',…]`, mutaciones por sección (`useUpdateStockEntry`, `useReplaceStockEntryItems`, `useReplaceStockEntryCosts`, `useQuickCreateItem`, `useConfirmStockEntry`, `useCancelStockEntry`), `useCostTypes` (`['stock-entry-cost-types']`, **5 min**), `useCostHistory` (`['cost-history',variantId,page]`, `keepPreviousData`), `searchVariants` (`GET /products?status=ACTIVE&q=` y aplana variantes: trae **productos completos**) |
| Invalidación                 | `useAfterChange(detail, affectsStock)`: confirmar invalida `inventory`, `inventory-movements`, `products`. El alta rápida invalida además `products`                                                                                                                                                 |
| Esquemas compartidos         | `createStockEntrySchema`, `stockEntryItemInputSchema`, `stockEntryCostInputSchema`, `quickCreateStockEntryItemSchema`, `createStockEntryCostTypeSchema` (usados en `lines.ts`, `cost-lines.ts` — con pruebas — y en los formularios)                                                                 |
| Permisos de UI               | `stock-entries:manage`, `stock-entries:confirm`, `costs:read`, `catalog:manage` (alta rápida), `suppliers:read`                                                                                                                                                                                      |

#### `pricing` — precios de venta (ADR-018)

| Elemento               | Detalle                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pantalla               | `PricingPage` con 3 pestañas (`role="tablist"`): `PriceGrid` (442 l.), `PendingPanel` (314 l.), `HistoryPanel`                                                                                                                                                                  |
| Hooks `use-pricing.ts` | `usePricingVariants(filters)`, `usePriceChanges(page,status,q)`, `usePendingChanges` (hasta 100), `useVariantPriceHistory` (`keepPreviousData`), `usePendingCount`; mutaciones `useRequestPrices`, `useApplyPrices`, `useApproveChanges`, `useRejectChanges`, `useCancelChange` |
| Invalidación           | Un único `useAfterChange` invalida `['pricing']`, `['products']` y `['approvals']` (grueso pero seguro)                                                                                                                                                                         |
| Lógica                 | `price-math.ts` (`parsePriceInput` con coma/punto, `profitView`): usa `salePriceSchema` compartido; la ganancia es `precio − costo total` (**no** hay costo × 2: P-03 sigue pendiente) y se **avisa** si es negativa, sin bloquear                                              |
| Permisos de UI         | `prices:approve` (Aplicar ahora / aprobar en masa), `prices:propose` (Solicitar cambio), `costs:read` (panel de costos)                                                                                                                                                         |

#### `audit` — auditoría (solo Administrador)

`AuditPage` (347 l.) con filtros en la URL (`?userId=&action=&entityType=&entityId=&from=&to=&q=&registro=`),
`AuditDetailDialog` (diálogo modal: `role="dialog"`, Esc cierra, foco entra y vuelve), diferencias antes/después
(`audit-diff.ts`), diccionarios en español con respaldo al código crudo (`audit-labels.ts`). Hooks: `useAuditList`
(`useListQuery`), `useAuditDetail`, `useAuditFilters` (staleTime 60 s). Solo lectura. Todo valor se muestra como texto
(React lo escapa).

#### `suppliers`

`SuppliersPage` + `SupplierForm` (289 l.). `useSuppliers` (`useListQuery`, `['suppliers',page,q,status,type]`),
`useActiveSuppliers(enabled)` (`['suppliers','active-picker']`, **5 min**, hasta 100, solo con `suppliers:read`),
`useCreate/UpdateSupplier` (invalidan `['suppliers']`). Esquema `createSupplierSchema`. Permiso `suppliers:manage`.
Confirmación con `window.confirm` para activar/desactivar.

#### `users`

`UsersPage`, `UserCreateForm`, `UserEditor` (nombre, roles, restablecer clave temporal). Hooks: `useUsers`
(`useListQuery`), `useAvailableRoles(enabled)`, mutaciones que invalidan `['users']` **y** `auth/me` (si cambian los
propios permisos). Esquemas: `createUserSchema`, `updateUserSchema`, `assignUserRolesSchema`, `resetPasswordSchema`.
Permisos: `users:manage`, `roles:manage`. **Sin ninguna prueba de componente** (solo E2E).

### 3.3 Archivos grandes (líneas)

| Líneas    | Archivo                                                    | Comentario                                      |
| --------- | ---------------------------------------------------------- | ----------------------------------------------- |
| **497**   | `catalog/attributes-page.tsx`                              | 3 componentes en un archivo                     |
| **489**   | `catalog/product-form.tsx`                                 | Formulario de alta/edición con ejes y proveedor |
| **483**   | `inventory-counts/capture-screen.tsx`                      | Captura + hallazgos + tabla de contados         |
| **448**   | `catalog/categories-page.tsx`                              | Árbol de dos niveles + atributos por categoría  |
| **442**   | `pricing/price-grid.tsx`                                   | Panel de costos + edición en lote               |
| **417**   | `adjustments/adjustment-new-page.tsx`                      | Incluye `VariantPicker`                         |
| **409**   | `stock-entries/stock-entry-page.tsx`                       | Página orquestadora del ingreso                 |
| **401**   | `inventory-counts/review-screen.tsx`                       | Revisión con diferencias                        |
| 391       | `app/app-shell.tsx`                                        | Panel + menú (datos en el mismo archivo)        |
| 389       | `catalog/labels-page.tsx`                                  |                                                 |
| 347 / 344 | `audit/audit-page.tsx` / `catalog/product-detail-page.tsx` |                                                 |

**8 archivos superan 400 líneas** (los de arriba hasta `review-screen`).

---

## 4. Componentes compartidos, patrones, accesibilidad y responsive

### 4.1 `components/ui` (sin lógica de negocio)

| Componente           | Qué hace                                                                                                                                              | Prueba               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `Button` (24 l.)     | 3 variantes (`primary` brand-700, `secondary`, `danger`), `min-h-10`, `type="button"` por defecto, foco visible                                       | —                    |
| `Input` (36 l.)      | Etiqueta asociada (`htmlFor`/`useId`), respeta `id` del llamador, combina `aria-describedby` del llamador con el mensaje de error (`aria-invalid`)    | 5 casos              |
| `Pagination` (82 l.) | `<nav aria-label="Paginación">`, resumen `aria-live="polite"`; **los botones siguen montados** y al llegar a un extremo el foco pasa al botón opuesto | 6 casos              |
| `Skeleton`           | Marcador `aria-hidden`, `motion-reduce:animate-none`                                                                                                  | —                    |
| `PageLoading`        | `role="status"`, `aria-live="polite"` (fallback de `Suspense`)                                                                                        | vía `lazy-page.test` |
| `FullPageMessage`    | Mensaje centrado (carga de sesión, sin permiso, 404)                                                                                                  | —                    |

No existen `Select`, `Textarea`, `Card`, `ButtonLink` ni diálogo: hay **33 `<select>`** y **7 `<textarea>`** con clases
copiadas, la clase de «enlace con aspecto de botón» repetida 6 veces y el contenedor de tarjeta (`rounded-xl border
border-stone-200 bg-white`) repetido ≈64 veces.

### 4.2 `lib/*` y `app/*`

| Módulo                  | Contenido y comportamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-client.ts`         | `apiRequest(method, path, body)`: `fetch` a `API_PREFIX` con `credentials: 'same-origin'` (la cookie `httpOnly` nunca la ve el JS). JSON o `FormData` (sin fijar `Content-Type` para conservar el `boundary`). `204` → `undefined`. Si `!ok` lanza **`ApiError`** `{status, code, message, details, requestId}`; si el cuerpo no es el formato estándar, usa `INTERNAL_ERROR` con «Error de comunicación con el servidor». Objeto `api.get/post/put/patch/delete`. **No tiene tiempo de espera ni cancelación** (`AbortSignal`)                                                           |
| `paging.ts`             | `PAGE_SIZE = 25`, `SMALL_PAGE_SIZE = 10`, tipo `Paged<T>`, `lastPageOf`, `useListQuery(key, fn)` (= `useQuery` + `keepPreviousData`). Lo usan **10 hooks** y `<Pagination>` aparece en **13** pantallas                                                                                                                                                                                                                                                                                                                                                                                   |
| `format.ts`             | Todas las instancias `Intl` creadas **una vez por módulo**: `formatBs` (`es-BO`/BOB, 2 decimales), `formatBsPrecise` (2–4), `formatUsd`, `formatInt`, `formatRatio`, `formatPercent`, `formatDate`, `formatDateTime`, `formatDateTimeSeconds`, `formatDateTimeLong`, `formatWeekdayDate`; fechas en `BUSINESS_TIME_ZONE` (`America/La_Paz`); `null`/`undefined` → «—». Importado por 23 archivos; solo queda un `Intl.Collator` local (`attention-table.tsx`)                                                                                                                             |
| `use-document-title.ts` | «Pantalla · Joyería Sole». Las **25** pantallas lo usan (verificado: ninguna de las 22 de la lista de rutas carece de título)                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `query-client.ts`       | `createQueryClient()`: `staleTime` 30 s, `gcTime` 10 min, `refetchOnWindowFocus: false`; **no reintenta errores 4xx** (`ApiError` con `status < 500`), hasta 2 reintentos en 5xx/red. `setQueryDefaults` de 5 min para `categories`, `attributes`, `suppliers/active-picker`, `stock-entry-cost-types`, `adjustments/reasons`. **Manejo global de 401**: `QueryCache.onError` y `MutationCache.onError` → si había usuario, `auth/me = null` y `removeQueries` de todo lo que no sea `auth`; `RequireAuth` redirige al login. Si no había usuario (credenciales incorrectas) no hace nada |
| `route-error.tsx`       | `role="alert"`; 404 vs «Algo salió mal» (sin detalle técnico), botón «Recargar la página» (útil tras una publicación nueva con chunks viejos)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lazy-page.tsx`         | `lazyPage(loader, guard)` (ver sección 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `test/render.tsx`       | `renderWithProviders` (misma `QueryClient`, `retry:false`, `MemoryRouter`) y `jsonResponse`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 4.3 Patrones de estado, errores y carga

| Patrón                | Realidad                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carga                 | Texto «Cargando …» con `role="status"` en **33** sitios; `Skeleton` solo en Inicio y en los detalles de ajuste, conteo e ingreso                                                          |
| Error                 | `role="alert"` (72 usos) y botón «Reintentar» (17 sitios) copiados a mano: **no existe `QueryState`**                                                                                     |
| Vacío                 | Mensaje por vista («No se encontraron …»); en Auditoría distingue con y sin filtros                                                                                                       |
| Mutaciones            | `mutateAsync` en `try/catch` y `error.message` (viene en español de la API); botón deshabilitado en `isPending`                                                                           |
| Errores 400 por campo | La mayoría valida con `safeParse` y muestra el primer mensaje del esquema; no hay mapeo sistemático de `details[{field,message}]` a cada campo                                            |
| Listas                | `useListQuery` + `aria-busy={isPlaceholderData}` (14 usos de `aria-busy`) y opacidad mientras llega la página siguiente                                                                   |
| Confirmaciones        | **10 `window.confirm`** (ajuste, conteo ×4, ingreso ×2, proveedor, usuario ×2) + **2 `alertdialog` inline** (eliminar ficha, eliminar foto) + 1 diálogo modal real (detalle de auditoría) |
| Dinero                | Strings de la API (`Decimal` serializado); la UI solo formatea y calcula la **ganancia** en vivo; nunca decide stock ni precio                                                            |

### 4.4 Accesibilidad

**Se cumple (verificado en código o en pruebas):**

| Aspecto                                                                                                                | Evidencia                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `lang="es"`, enlace «Saltar al contenido», un único `<nav aria-label="Navegación principal">`                          | `index.html`, `app-shell.tsx`                   |
| Título de pestaña por pantalla y foco al `<main>` al cambiar de ruta (sin robar el foco a un campo propio)             | `use-document-title`, `route-focus.test.tsx`    |
| Etiquetas asociadas (`Input`, `htmlFor`) y `aria-describedby` combinado con el error                                   | `input.test.tsx`                                |
| Tarjeta de producto: un enlace con nombre «Ver ficha de …» y descripción con precio, estado y stock; imagen decorativa | `product-card.tsx` + 10 pruebas                 |
| `<ul aria-label="Productos" aria-busy>`; paginación estable con foco conservado                                        | `products-page.test.tsx`, `pagination.test.tsx` |
| Diálogo de auditoría: Esc, foco dentro y retorno                                                                       | `audit-detail.tsx`                              |
| Cajón móvil con Escape y foco al botón de cerrar                                                                       | `app-shell.tsx`                                 |
| Color nunca como única señal (insignias con texto; conteo con aviso textual)                                           | `product-summary.ts`, `capture-screen.tsx`      |
| Contraste: ya no se usa `stone-400`; botón primario `brand-700`; textos secundarios `stone-600/500`                    | `grep` (0 usos de `text-stone-400`)             |
| `motion-reduce` en los _skeletons_                                                                                     | `skeleton.tsx`                                  |
| Objetivos táctiles `min-h-10`/`min-h-12` (87 usos)                                                                     | código                                          |
| Etiquetas SVG con `role="img"` y `aria-label`                                                                          | `label.tsx`                                     |
| Estados con `role="status"`/`role="alert"`/`aria-live`                                                                 | 56 + 72 + 6 usos                                |

**No se cumple o está sin verificar (honesto):**

| Hueco                          | Detalle                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin verificación automática    | No hay `axe` ni `jest-axe` ni Lighthouse en el proyecto; **no hay prueba E2E de teclado** más allá del lector simulado en el conteo          |
| Pestañas de Precios            | `role="tablist"/"tab"/"tabpanel"` con `aria-selected`, pero **sin navegación con flechas ni _roving tabindex_** (patrón ARIA incompleto)     |
| Confirmaciones                 | `window.confirm` (nativo, sin estilo ni foco gestionado) y los `alertdialog` inline **no mueven el foco ni cierran con Escape**              |
| Paneles que se abren inline    | Historial de costos/precios, stock inicial y formularios de la ficha no llevan el foco al panel abierto                                      |
| Tablas                         | Se usan `<th>` (168) pero el `scope` explícito solo aparece en una minoría; sin `<caption>`                                                  |
| Tablas en modo tarjeta (móvil) | Al convertir la tabla en tarjetas con CSS (`display:block`) los lectores pueden perder la semántica de tabla (sin comprobar con lector real) |
| Contraste exacto               | No medido con herramienta; paleta definitiva de marca sigue **pendiente (P-16)**                                                             |
| Lector de pantalla real        | No se probó con NVDA/VoiceOver; todo lo anterior es por código y pruebas de Testing Library                                                  |

### 4.5 Responsive

| Mecanismo                                            | Detalle                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Container queries** (no media queries de viewport) | `AppShell` declara `@container` en el contenido; con panel lateral fijo, una pantalla de 1024 px deja ≈700 px útiles. Cuadrícula de productos `grid-cols-2 @xl:3 @2xl:4 @4xl:5`; Inicio usa `@4xl`                                                                                                                                                                                  |
| **Tablas → tarjetas**                                | Clase `table-cards` (en `index.css`): bajo **56 rem (896 px) de contenedor** cada fila pasa a tarjeta; la primera celda es el título, `data-label` produce «ETIQUETA valor», las celdas sin etiqueta (acciones) van al pie. **20 tablas** la usan (inventario, movimientos, ajustes, conteos, ingresos, precios, auditoría, usuarios, proveedores, costos…)                         |
| Cajón móvil                                          | Panel lateral fijo desde `lg`; cajón con telón por debajo                                                                                                                                                                                                                                                                                                                           |
| Regresión automatizada                               | `responsive.spec.ts`: 5 anchos (320, 390, 768, 1024, 1440) × 16 pantallas; falla si la página desborda o si un control queda recortado por un contenedor con scroll; a ≤ 390 px se repite con **tipografía ancha** (Verdana), porque Linux (CI) usa fuentes más anchas que Windows y a 320 px sacaba un campo de su tarjeta. `s10-audit.spec.ts` repite 320/768/1440 para Auditoría |
| No cubiertas por `responsive.spec`                   | `/catalogo/etiquetas`, `/precios`, `/inventario/conteos`, `/productos/:id`, `/inventario/ajustes/:id`, `/inventario/conteos/:id`                                                                                                                                                                                                                                                    |

### 4.6 Etiquetas e impresión (Code 128)

- Codificación (`code128.ts`): usa `jsbarcode` en **modo objeto** (devuelve el patrón de barras) y **React dibuja el SVG**
  (`LabelBarcode`): sin manipular el DOM ni insertar HTML. Zona de silencio de 10 módulos. Lanza si el texto está vacío o
  no es ASCII; la etiqueta muestra una alerta en vez de romperse.
- Contenido de la etiqueta (decisión Q-10 A, B7): **solo el Code 128 del SKU y el SKU legible**; ni nombre ni precio.
- Tamaño configurable (por defecto **50 × 25 mm**; 20–150 × 10–100 mm), validado con `labelSizeSchema` y guardado en
  `localStorage` (`joyeria.labelSize`) con tolerancia a almacenamiento bloqueado.
- Impresión (`label-settings.ts → labelPrintCss`): `@page { size: W H; margin: 0 }`, `#print-labels` oculto en pantalla,
  y en `@media print` se oculta `body > #root` y se muestra `#print-labels` con **una etiqueta por página**
  (`break-after: page`). El área se monta en un **portal hijo de `<body>`** (`LabelPrintArea`), fuera de `#root`.
- Límites: 1 000 etiquetas por impresión y 200 copias por pieza. La vista previa muestra las 12 primeras.
- Origen de las piezas: lector/teclado (SKU, código o nombre) o `?codes=SKU1,SKU2` desde la ficha (máx. 50).
- Pruebas: `code128.test.ts` (5), `label-settings.test.ts` (9), `label.test.tsx` (3), `labels-page.test.tsx` (5) y el E2E de
  `s2-catalog-complete.spec.ts` que usa `emulateMedia({ media: 'print' })` y comprueba `@page` y un SVG por etiqueta.
- Pendiente: el área de impresión se monta siempre que haya piezas (hasta 1 000 SVG ocultos) y la carga desde `?codes=`
  consulta secuencialmente (ver sección 7).

### 4.7 Lector de códigos como teclado

El lector se trata como un teclado que escribe y pulsa **Enter**; no hay integración por marca. Patrón real: un
`<form onSubmit>` con un campo de texto (no `onKeyDown` + `autoFocus` como sugiere la skill).

| Pantalla                           | Comportamiento con el código leído                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Productos`                        | `lookupVariant` (SKU, código de barras o de proveedor); si coincide, informa «Encontrada por …» con la foto, filtra por el SKU y **deja el texto seleccionado** para que la siguiente lectura lo reemplace; 404 → búsqueda por texto; 409 (código de varios proveedores) → muestra el mensaje de la API |
| `Conteo (captura)`                 | Campo siempre enfocado; cada lectura viaja al servidor; sin `disabled` en el envío; pitido + destello + foto; «Deshacer última lectura»                                                                                                                                                                 |
| `Etiquetas`                        | Agrega la pieza (o suma una copia si ya está); sin coincidencia exacta ofrece lista                                                                                                                                                                                                                     |
| `Ajuste nuevo` / `Ingreso (ítems)` | Coincidencia exacta y única por SKU/código → se agrega sola; si no, lista de resultados                                                                                                                                                                                                                 |
| Inventario                         | Búsqueda por producto, SKU o código (con `?sku=` precargado)                                                                                                                                                                                                                                            |

### 4.8 Estado en la URL

| Pantalla         | En la URL                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Productos`      | `?q=&categoryId=&incomplete=1&withoutPrice=1&page=`; la ficha recibe `state.productsSearch` para que «← Volver a Productos» conserve el contexto                                                 |
| `Auditoría`      | Todos los filtros y `?registro=` (el detalle abierto)                                                                                                                                            |
| Accesos cruzados | `Ajustes ?estado=PENDING`, `Conteos ?estado=IN_REVIEW`, `Precios ?tab=pendientes&q=`, `Inventario ?sku=&accion=inicial`, `Ajuste nuevo ?sku=&cero=1`, `Etiquetas ?codes=` (solo lectura inicial) |
| Resto de listas  | Inventario, Ajustes, Conteos, Ingresos, Proveedores, Usuarios y Precios guardan filtros y página en **estado local** (se pierden al volver desde un detalle)                                     |

### 4.9 Regla «foto de la pieza junto al nombre»

Pedido del cliente: identificar cada pieza de un vistazo en **cualquier pantalla** donde aparezca.

| Componente                                      | Entrada          | Origen de la imagen                                                                                                  | Uso                                                                                                     |
| ----------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PieceImage` (`catalog/photos/piece-image.tsx`) | `variantId`      | **`GET /api/v1/products/variants/:variantId/cover`** (imagen de portada o SVG «Sin foto» con 200, nunca imagen rota) | Pantallas que solo conocen la **variante**                                                              |
| `ProductThumb`                                  | `product.photos` | `photos[].url` (de `GET /products/:id/photos/:photoId`, `isSafePhotoUrl` exige que empiece por `/api/`)              | Tarjeta del listado y cabecera de la ficha (con `priority` → `loading="eager"`, `fetchPriority="high"`) |

Detalles de `PieceImage`: `alt=""` (decorativa; el nombre va siempre como texto al lado), `loading="lazy"`,
`decoding="async"`, tamaño por clases (`size-14` por defecto), marcador gris si no hay `variantId`.

**Cabeceras de `/cover` (API, `photos.routes.ts`)**: `ETag` = SHA-256 de la foto, **`Cache-Control: private, no-cache`**
(se revalida siempre; la portada puede cambiar), `nosniff`, CSP `default-src 'none'; sandbox`. La foto por id (`/photos/:photoId`) es
`private, max-age=31536000, immutable`. Ambas con límite de tasa propio por usuario.

**Dónde se aplica (22 usos en 15 pantallas):** Inventario (lista, panel de historial, stock inicial), Movimientos, Inicio
(piezas que requieren atención), Ajuste nuevo (resultados y líneas), Detalle de ajuste, Conteo (última lectura y tabla de contados,
revisión), Precios (grilla, pendientes, historial de cambios), Ingresos (buscador, ítems, panel de costos), Etiquetas
(resultados y selección), Productos (resultado del lector), ficha (`VariantRow` por variante) y tarjeta/ficha
(`ProductThumb`).

**Dónde NO se aplica (y por qué es razonable o es hueco):**

| Pantalla                                                     | Estado                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Lista de Ajustes, Conteos, Ingresos                          | Son documentos de varias piezas: no hay una pieza que ilustrar (razonable) |
| Historial de costos / de precios **dentro de la variante**   | Ya están bajo la foto de `VariantRow` (razonable)                          |
| Auditoría                                                    | Muestra entidad e ID, no piezas                                            |
| Proveedores, Usuarios, Categorías, Atributos, Tipos de costo | No son piezas                                                              |
| `Imprimir etiqueta`                                          | Por decisión, solo código y SKU                                            |

**Riesgos (análisis; no medidos en navegador):**

1. `PieceImage` usa una URL **constante por variante** y `no-cache`: una pantalla con N piezas hace N peticiones
   condicionales (304) en cada visita. Mitigación pendiente: devolver `coverPhotoId` en los listados y usar la URL
   inmutable por id, o `max-age` corto.
2. Tras cambiar la portada, las `PieceImage` ya montadas (p. ej. las de `VariantRow` en la misma ficha) **no cambian
   de URL** y pueden mostrar la imagen anterior hasta recargar o volver a montar; `ProductThumb` sí cambia (usa el id de la foto).
3. No hay miniaturas: la imagen servida es la reducida a 1200 px (WebP) y se muestra a 40–235 px.
4. `PieceImage` construye la URL por su cuenta y no pasa por `isSafePhotoUrl` (la ruta es fija, sin entrada del usuario).

---

## 5. Rendimiento

### 5.1 Bundle por chunk (medido: `vite build` con Vite 8.3.3, 2 309 módulos, ≈9,7 s)

Carga inicial = `index.html` + `index-*.js` + 4 chunks `modulepreload`:

| Chunk (inicial)           | kB         | gzip kB    | Contenido (verificado por marcas en el código)                                                           |
| ------------------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `index-*.js`              | 370,47     | 114,96     | `react-dom`, `react-router`, íconos `lucide`, `AppShell`, Login, Inicio, Mi cuenta, formatos             |
| `use-document-title-*.js` | 153,07     | 44,46      | React (núcleo), TanStack Query y Zod/`@joyeria/shared` (el nombre lo toma de un módulo pequeño agrupado) |
| `useMutation-*.js`        | 5,75       | 1,84       | `useMutation` de TanStack Query                                                                          |
| `rolldown-runtime-*.js`   | 0,58       | 0,36       | Runtime del empaquetador                                                                                 |
| `paging-*.js`             | 0,20       | 0,17       | `lib/paging.ts`                                                                                          |
| **Subtotal JS inicial**   | **≈530,1** | **≈161,8** |                                                                                                          |
| `index-*.css`             | 40,78      | 8,30       | Tailwind generado                                                                                        |

Chunks perezosos (se descargan al visitar la ruta):

| Chunk                                    | kB        | gzip  | Chunk                                                            | kB          | gzip        |
| ---------------------------------------- | --------- | ----- | ---------------------------------------------------------------- | ----------- | ----------- |
| `labels-page`                            | **74,87** | 15,14 | `suppliers-page`                                                 | 10,15       | 3,12        |
| `stock-entry-page`                       | 26,54     | 7,39  | `attributes-page`                                                | 9,70        | 2,81        |
| `product-detail-page`                    | 24,45     | 6,61  | `categories-page`                                                | 8,52        | 2,66        |
| `count-page`                             | 23,45     | 5,93  | `adjustment-page`                                                | 8,00        | 2,70        |
| `pricing-page`                           | 19,90     | 5,25  | `inventory-page`                                                 | 7,62        | 2,54        |
| `audit-page`                             | 19,59     | 6,11  | `variant-price-history`                                          | 7,51        | 2,52        |
| `product-price` (compartido de catálogo) | 14,49     | 4,78  | `products-page`                                                  | 7,47        | 2,82        |
| `users-page`                             | 12,18     | 3,46  | `counts-page` / `adjustments-page`                               | 6,77 / 6,54 | 2,37 / 2,32 |
| `adjustment-new-page`                    | 10,46     | 3,52  | resto (≈20 chunks de 0,2–5,6 kB: hooks y utilidades compartidas) |             |             |

Totales: **41 archivos**, 885,6 kB en disco (≈845 kB de JS + 40,8 kB de CSS); suma de JS ≈ **253 kB gzip** si se visitara todo.

| Comparación                                                  | JS inicial  | gzip        |
| ------------------------------------------------------------ | ----------- | ----------- |
| Antes de dividir (medición previa del equipo, un solo chunk) | ≈851 kB     | ≈224 kB     |
| **Ahora**                                                    | **≈530 kB** | **≈162 kB** |
| Reducción                                                    | **−38 %**   | **−28 %**   |

Observaciones: el aviso histórico de Vite («chunk > 500 kB», 656–670 kB en `PHASE-1-PREPARATION.md`) ya no
aparece: el mayor chunk es `index` con 370 kB. `jsbarcode` (~63 kB) queda aislado en Etiquetas. Quedan **153 kB**
de React/Query/Zod que podrían separarse como `vendor` con caché propia (no hay `manualChunks`).

### 5.2 Servidor de estáticos (producción)

`@fastify/static` sin opciones de caché ni compresión (la API tampoco registra `@fastify/compress`): los activos con
hash se sirven con `max-age=0` y sin gzip/brotli salvo que lo haga el proxy del hosting. **Abierto** (P-14 de la revisión).
Además, la API envía `Cache-Control: no-store` en todas las respuestas JSON de negocio: **la caché de datos del
navegador es solo la de TanStack Query**.

### 5.3 Imágenes

Subida validada en el navegador (`validatePhotoFile`: JPG/PNG/WebP, > 0 bytes, ≤ 5 MB; **no es medida de seguridad**) y revalidada y
re-codificada por la API (WebP ≤ 1200 px, sin EXIF). Listado: `loading="lazy"`, `decoding="async"`; ficha: imagen principal
`eager` + `fetchPriority="high"`, con `width`/`height` del metadato (evita saltos de diseño). No hay `srcset` ni miniaturas.

### 5.4 Caché de datos

| Tipo                    | `staleTime`                                                                       | Dónde                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Por defecto             | 30 s (`gcTime` 10 min)                                                            | `query-client.ts`                                                                             |
| Referencia              | 5 min                                                                             | categorías, atributos, proveedores activos, tipos de costo, motivos de ajuste, usuario actual |
| Auditoría (filtros)     | 60 s                                                                              | `useAuditFilters`                                                                             |
| Bandeja de aprobaciones | 30 s + refetch al enfocar la ventana                                              | `usePendingApprovals`                                                                         |
| Detalle de producto     | `initialData` desde listados en caché (+ `initialDataUpdatedAt`)                  | `useProduct`                                                                                  |
| Detalles tras mutación  | `setQueryData` con la respuesta de la API (ajustes, conteos, ingresos, productos) | `useAfterChange`                                                                              |

Costes conocidos: el conteo invalida el detalle completo tras **cada lectura** (red + re-render de la tabla; hay que
fusionar con `setQueryData`); el Inicio hace 7 peticiones y la tabla de atención carga hasta 200 filas (no existe un
endpoint de resumen).

### 5.5 Re-renders

Solo `ProductCard` usa `memo`; hay 16 usos de `useMemo`/`useCallback`/`memo` en total. Puntos calientes
identificados por lectura de código (no perfilados): en `CaptureScreen` el texto del campo (`code`) vive en la raíz y
vuelve a renderizar la tabla en cada tecla; `beep()` crea un `AudioContext` por lectura; `LabelPrintArea` renderiza hasta
1 000 SVG aunque la vista previa muestre 12.

---

## 6. Pruebas en todo el proyecto

### 6.1 Resumen por tipo (cifras comprobadas)

| Tipo                     | Herramienta                                 | Archivos         | Pruebas | Dónde se contó                                                                                                                                     |
| ------------------------ | ------------------------------------------- | ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias API            | Vitest (`project: unit`)                    | 16               | **140** | 124 por `vitest list` + 16 por la expansión de 3 `it.each` (`error-handler` 6, `errors` 6, `test-database-url` 7, cada uno cuenta 1 en el listado) |
| Integración API          | Vitest + Fastify `inject` + PostgreSQL real | 21               | **350** | `grep` por archivo (sin `.each`)                                                                                                                   |
| **Subtotal API**         |                                             | **37**           | **490** | = salida de Vitest en CI (`37 files, 490 tests`)                                                                                                   |
| Web: lógica pura         | Vitest + jsdom                              | 9 (`.test.ts`)   | 66      | `grep`                                                                                                                                             |
| Web: componentes/páginas | Vitest + Testing Library                    | 25 (`.test.tsx`) | 143     | `grep`                                                                                                                                             |
| **Subtotal web**         |                                             | **34**           | **209** | = CI (`34 files, 209 tests`)                                                                                                                       |
| E2E                      | Playwright (Chromium)                       | 18 (+1 helper)   | **59**  | `playwright test --list` (el bucle de `responsive` genera 5 casos y el de `s10-audit` 3)                                                           |
| **Total**                |                                             | **89**           | **758** |                                                                                                                                                    |

`packages/shared` **no tiene pruebas propias** (los esquemas se ejercitan indirectamente desde API y web). No hay
herramienta de **cobertura** configurada (ni `@vitest/coverage-*` ni umbrales): cualquier «% de cobertura» sería inventado.

### 6.2 `apps/web` — 34 archivos / 209 pruebas

| Archivo                                | Pruebas | Qué cubre                                                                                                                                    |
| -------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/app-shell.test.tsx`               | 8       | Menú por permiso (incluye `Auditoría` solo con `audit:read`), entradas «Próximamente», cajón móvil                                           |
| `app/lazy-page.test.tsx`               | 3       | Carga perezosa, aviso accesible, error de descarga → `RouteError`, no descarga sin permiso                                                   |
| `app/query-client.test.tsx`            | 7       | Defaults 30 s/10 min, referencia 5 min, no reintentar 4xx, **401 global** (descarta usuario)                                                 |
| `app/route-focus.test.tsx`             | 2       | Foco al `<main>` al cambiar de ruta; no roba el de un campo propio                                                                           |
| `ui/input.test.tsx`                    | 5       | Etiqueta, `id`, `aria-describedby` combinado con el error                                                                                    |
| `ui/pagination.test.tsx`               | 6       | Oculta si cabe, `nav` + `aria-live`, botones montados, foco en extremos                                                                      |
| `lib/format.test.ts`                   | 6       | Bs, USD, fechas La Paz, «—»                                                                                                                  |
| `auth/login-page.test.tsx`             | 2       | Validación y error de API                                                                                                                    |
| `auth/require-auth.test.tsx`           | 2       | Redirección, permisos                                                                                                                        |
| `catalog/products-page.test.tsx`       | 10      | Lista, vacío, error + reintento, **lector** (exacto/404/409), filtros en URL, página y foco                                                  |
| `catalog/product-detail-page.test.tsx` | 16      | Roles (read/manage/delete), stock bloquea desactivar, eliminar con confirmación, 404 vs 500, volver con contexto, título, imagen prioritaria |
| `catalog/product-card.test.tsx`        | 10      | Nombre/descripción accesibles, estados, stock por permiso                                                                                    |
| `catalog/use-products.test.tsx`        | 4       | `initialData` desde listado, frescura, `setQueryData` tras mutación                                                                          |
| `catalog/product-summary.test.ts`      | 9       | `availability`, `priceLabel`, `productStock`                                                                                                 |
| `catalog/product-badges.test.tsx`      | 3       | «Ficha incompleta», «Sin precio»                                                                                                             |
| `catalog/attribute-values.test.ts`     | 3       | Valores de atributos                                                                                                                         |
| `catalog/code128.test.ts`              | 5       | Codificación y ancho                                                                                                                         |
| `catalog/label-settings.test.ts`       | 9       | Tamaños, `localStorage`, CSS `@page`                                                                                                         |
| `catalog/label.test.tsx`               | 3       | Una etiqueta por SKU                                                                                                                         |
| `catalog/labels-page.test.tsx`         | 5       | Lector + Enter, lista de candidatos, `?codes=`, tamaño, `window.print`                                                                       |
| `catalog/photos/photos.test.tsx`       | 9       | Galería con/sin permiso, subida multipart, límite de 5, confirmación                                                                         |
| `catalog/photos/photo-files.test.ts`   | 3       | Validación previa                                                                                                                            |
| `catalog/photos/photo-url.test.tsx`    | 2       | `isSafePhotoUrl` y `ProductThumb`                                                                                                            |
| `catalog/photos/piece-image.test.tsx`  | 2       | URL `/cover` y marcador                                                                                                                      |
| `dashboard/dashboard-page.test.tsx`    | 6       | Métricas exactas, _skeletons_, orden `aria-sort`, error, vacío, sin permiso                                                                  |
| `inventory/movements-page.test.tsx`    | 1       | Etiquetas de cambios de pieza en español                                                                                                     |
| `adjustments/adjustment-form.test.ts`  | 6       | Esquema y cálculo de diferencias                                                                                                             |
| `adjustments/adjustment-page.test.tsx` | 5       | Acciones por rol, bloqueo de aprobar sin saldo                                                                                               |
| `inventory-counts/count-page.test.tsx` | 7       | Captura a ciegas, tomar conteo, segundo recuento, revisión por permiso, opciones de categoría                                                |
| `pricing/pricing-page.test.tsx`        | 11      | Ganancia en vivo, neto, sin costos sin `costs:read`, solicitar vs aplicar, aprobación en masa                                                |
| `stock-entries/lines.test.ts`          | 10      | Líneas del borrador, USD sin tipo de cambio                                                                                                  |
| `suppliers/suppliers-page.test.tsx`    | 4       | Solo lectura, tipo/país/moneda, filtros, alta del exterior                                                                                   |
| `audit/audit-logic.test.ts`            | 15      | Diccionarios, diffs, filtros de la URL                                                                                                       |
| `audit/audit-page.test.tsx`            | 10      | Tarjetas, filtros, rango invertido, vacío/error, detalle escapado, Esc                                                                       |

**Sin prueba directa de componente** (algunos se ejercen indirectamente desde su página): `users` (4 archivos, 0
pruebas), `inventory-page`, `adjustments-page`, `adjustment-new-page`, `categories-page`, `attributes-page`,
`product-form`, `variant-row`, `variant-forms`, `stock-entries/*` (salvo `lines.ts`), `counts-page`, `cost-types-page`,
`account-page`, `change-password-form`, `forced-password-change`, `pending-approvals`, `router.tsx`, `api-client.ts`,
`paging.ts`, `use-*.ts` (salvo `use-products`). `capture-screen`, `review-screen`, `price-grid`, `pending-panel`,
`attention-table` y `supplier-form` se ejercen **solo a través** de su página.

### 6.3 `apps/api/test` — unitarias (16 archivos / 140)

| Archivo              | Pruebas | Qué cubre                                                                               |
| -------------------- | ------- | --------------------------------------------------------------------------------------- |
| `audit-redaction`    | 7       | Claves sensibles redactadas (recursivo, profundidad)                                    |
| `costing`            | 22      | Importes exactos, reparto por valor (500 casos aleatorios: la suma da el total), USD→Bs |
| `count-logic`        | 15      | Conciliación del conteo, recuento, solapamientos, normalización de códigos              |
| `dates`              | 7       | Fechas en `America/La_Paz`, `dayRangeLaPaz`                                             |
| `env`                | 12      | Variables de entorno, `TRUST_PROXY_HOPS`, avisos                                        |
| `error-handler`      | 7       | Errores transitorios de BD → 503 con `Retry-After`                                      |
| `errors`             | 7       | `AppError` → estado HTTP y código                                                       |
| `exchanges`          | 8       | Esquema y etiquetas de cambios de pieza                                                 |
| `image-processing`   | 8       | Firma de bytes, reducción a 1200 px, políglotas                                         |
| `password`           | 4       | Argon2 y tokens de sesión                                                               |
| `permissions-matrix` | 7       | Regla de autorización compartida (Admin y Responsable)                                  |
| `pricing`            | 10      | `computeProfit`, esquemas de precios                                                    |
| `role-permissions`   | 8       | Permisos por defecto de los roles                                                       |
| `sku`                | 1       | Candidatos de SKU                                                                       |
| `stock-ledger`       | 8       | `planBalanceChange`, `valueOfDelta`                                                     |
| `test-database-url`  | 9       | Salvaguarda: solo `joyeria_test` en localhost                                           |

### 6.4 `apps/api/test` — integración (21 archivos / 350, BD real, en serie)

| Archivo                | Pruebas | Qué cubre (resumen)                                                                                                                             |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock-entries`        | 51      | Permisos, borrador sin efecto en stock, costos, diferencias, confirmación única y concurrente, alta rápida, historial de costos, tipos de costo |
| `inventory-counts`     | 39      | Conteo a ciegas (el JSON no filtra stock), alcance, escaneo, hallazgos, segundo recuento, aprobación atómica, conciliación                      |
| `product-photos`       | 31      | Subida/lectura con ETag/304, formatos, límites, portada, orden, borrado, `/cover` por variante                                                  |
| `pricing`              | 29      | Solicitud/aprobación/rechazo en masa atómicos, `ADMIN_DIRECT`, historial inmutable, sin costos al Vendedor                                      |
| `adjustments`          | 27      | Solicitud/aprobación, revalidación, concurrencia sin saldo negativo, triggers                                                                   |
| `catalog-complete`     | 23      | Atributos, categorías de 2 niveles, ejes, códigos de proveedor, ficha incompleta, eliminación física                                            |
| `users`                | 21      | Consulta, restablecimiento de clave, **escalada con rol ADMIN**                                                                                 |
| `audit`                | 17      | 401/403/400, filtros, detalle, redacción efectiva                                                                                               |
| `catalog`              | 17      | Catálogo, categorías, valores, productos y variantes                                                                                            |
| `security-hardening`   | 17      | Cobertura de auth en **todas** las rutas, cabeceras de producción, CSRF por `Origin`, límites de login, sesión por petición                     |
| `exchanges`            | 13      | Doble movimiento atómico                                                                                                                        |
| `inventory`            | 13      | Saldos, alertas, stock inicial                                                                                                                  |
| `auth`                 | 10      | Sesión fija de 8 h, login/logout                                                                                                                |
| `suppliers`            | 9       | CRUD, NIT duplicado, filtros                                                                                                                    |
| `cost-visibility`      | 8       | El Vendedor no recibe costos; notas de movimientos                                                                                              |
| `catalog-deactivation` | 6       | Regla P-22                                                                                                                                      |
| `database-integrity`   | 6       | `CHECK (quantity ≥ 0)` y errores sin detalles                                                                                                   |
| `approvals`            | 5       | Bandeja de pendientes                                                                                                                           |
| `performance-indexes`  | 5       | Índices y búsquedas con `q` de 3+ caracteres                                                                                                    |
| `health`               | 2       | `/health`                                                                                                                                       |
| `negative-stock-guard` | 1       | Saldo negativo rechazado por la BD                                                                                                              |

Helpers (`apps/api/test/helpers/`): `buildTestApp`, `login`/`cookieHeader`, `resetDatabase`, `createTestUser`,
`seedAdjustmentReasons`, `seedCostTypes`, `makeImage`/`multipartPayload`, `testDatabaseUrl`/`testEnv` y
`global-setup.ts` (aplica migraciones al inicio y **deja la BD vacía al terminar**, para que los totales del
dashboard en E2E no se contaminen).

### 6.5 `apps/web/e2e` — 18 specs / 59 pruebas (Playwright, orden alfabético, 1 worker)

| Spec                   | Pruebas | Flujo                                                                                                                                               |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                 | 2       | Redirección a `/login`; iniciar y cerrar sesión                                                                                                     |
| `dashboard`            | 2       | **Totales exactos** con datos DEMO (20/10/5/5) y orden; navegación y menú móvil                                                                     |
| `password-reset`       | 1       | Restablecer → login con temporal → cambio forzado → login normal                                                                                    |
| `pricing`              | 4       | Solicitud y aplicación en lote; Vendedor sin costos; cambio directo; ganancia con costo real                                                        |
| `product-deactivation` | 1       | Con stock no se desactiva; sin stock sí                                                                                                             |
| `responsive`           | 7       | 5 anchos × 16 pantallas (sin desbordes ni controles recortados), tarjetas en móvil, orden en móvil                                                  |
| `roles-and-products`   | 11      | Menú por rol, rutas protegidas (web y API 403), catálogo DEMO de 20 productos, crear/editar + stock inicial                                         |
| `s10-audit`            | 6       | Acción → aparece en auditoría con antes/después; 320/768/1440; 403 a Responsable y Vendedor                                                         |
| `s2-catalog-complete`  | 7       | Atributos y ficha con variantes; código repetido; **impresión de etiquetas**; avisos del Inicio; categorías; eliminar ficha; Vendedor solo consulta |
| `s3-product-photos`    | 2       | Subir, portada, reordenar, eliminar con confirmación; Vendedor solo ve                                                                              |
| `stock-adjustments`    | 3       | Solicita → aprueba → cambia el stock; «Ajustar a cero»; Vendedor sin acceso                                                                         |
| `stock-counts`         | 2       | Conteo a ciegas completo con lector simulado y 3 usuarios; Vendedor sin acceso                                                                      |
| `stock-entries-import` | 3       | Tipo de costo; ingreso en USD con costos y pieza nueva; código de proveedor repetido                                                                |
| `stock-entries`        | 3       | Borrador → costos → confirmar → stock sube; valor cero bloquea; Vendedor sin acceso                                                                 |
| `stock-exchanges`      | 2       | Cambio de pieza **por API** (no hay pantalla) e historial                                                                                           |
| `suppliers`            | 1       | Alta, búsqueda, edición, desactivación                                                                                                              |
| `users-management`     | 1       | Crear usuario, cambiar clave, desactivar                                                                                                            |
| `users`                | 1       | Administrador consulta usuarios                                                                                                                     |

Sin `test.fixme`/`test.skip` incondicionales: el `test.skip(!PASSWORD, …)` de cada spec solo omite si falta
`DEMO_USER_PASSWORD` (el runner siempre la define). **12 de los 18 specs redefinen su propio `login()`**.

### 6.6 Estrategia

| Eje                  | Cómo se hace                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BD efímera**       | `scripts/qa.mjs`: un contenedor `postgres:18-alpine` por ejecución (puerto dinámico ligado a `127.0.0.1`, contraseñas aleatorias, etiqueta `joyeria.qa=ephemeral`, `--rm`), `db:generate`, y según modo `check`/`api`/`e2e`/`all`: `npm run check`, `db:deploy`, `db:seed`, `db:seed:demo`, `test:e2e`. Se detiene siempre en `finally`. Filtros solo por nombre de archivo (`^[a-z0-9-]+\.spec\.ts$`). No carga el `.env` del proyecto |
| Protección de la BD  | `testDatabaseUrl()` exige host local, base exacta `joyeria_test` y solo `schema=public`; tiene 9 pruebas                                                                                                                                                                                                                                                                                                                                |
| Integración          | Fastify `inject` + PostgreSQL real, `fileParallelism: false` (una BD compartida), `testTimeout` 20 s, `hookTimeout` 60 s, `resetDatabase()` por archivo                                                                                                                                                                                                                                                                                 |
| Web                  | `jsdom`, `pool: 'forks'`, `maxWorkers: 1`, `isolate: false` (en Windows el pool de threads agotó el arranque), `fetch` simulado con `vi.spyOn(globalThis,'fetch')` y `renderWithProviders`; `afterEach` limpia el DOM y restaura mocks                                                                                                                                                                                                  |
| **E2E en serie**     | `fullyParallel: false`, `workers: 1`: una BD y un servidor; los totales del dashboard dependen de los datos DEMO sin tocar, por eso `dashboard.spec` debe correr antes que los specs que crean o mueven stock (el orden es alfabético)                                                                                                                                                                                                  |
| Servidores E2E       | API `:3001` y web `:5174` (configurables con `E2E_API_PORT`/`E2E_WEB_PORT`), `reuseExistingServer: false`, `LOGIN_RATE_LIMIT_MAX=1000`, `COOKIE_SECURE=false`                                                                                                                                                                                                                                                                           |
| Datos DEMO           | `db:seed:demo`: 3 usuarios (admin, inventario, vendedor), 4 categorías, 20 productos (10 disponibles, 5 bajo mínimo, 5 sin stock), 3 ajustes y 2 conteos de ejemplo; se niega a correr en producción o contra BD no local                                                                                                                                                                                                               |
| Tiempos y reintentos | `timeout` 60 s por prueba, `expect` 10 s, `retries: 1` solo en CI, `trace: 'retain-on-failure'`                                                                                                                                                                                                                                                                                                                                         |
| Calidad estática     | `lint` (`--max-warnings 0`), `format:check`, `typecheck` por workspace, Husky + lint-staged (pre-commit) y typecheck (pre-push)                                                                                                                                                                                                                                                                                                         |

### 6.7 Tiempos de CI (datos reales de GitHub Actions, 2026-11-06)

Ejecución de referencia `release: integrar la Fase 1 a main` (rama `develop`, **éxito**), job `quality` 14 min 17 s:

| Paso                              | Duración aprox.                                          |
| --------------------------------- | -------------------------------------------------------- |
| `npm ci`                          | ≈ 60–70 s                                                |
| Lint                              | ≈ 40 s                                                   |
| Formato                           | ≈ 9 s                                                    |
| Typecheck                         | ≈ 15–25 s                                                |
| Migraciones desde cero            | ≈ 2 s                                                    |
| **Tests (API + web)**             | **≈ 2,2–3,0 min** (Vitest: API **166 s**, web **9,7 s**) |
| Build                             | ≈ 10–15 s                                                |
| Chromium para E2E                 | ≈ 20 s (una vez tardó 8 min 47 s)                        |
| **E2E (59 pruebas)**              | **7,4–7,6 min** (6,4 min en la ejecución con 1 flaky)    |
| Job `docker` (build sin publicar) | ≈ 3,7 min                                                |

El comentario de `ci.yml` («Calidad ~12 min + E2E ~17 min en local») está **desactualizado**: en el runner la suma
completa de `quality` ronda **14–20 min** y el `timeout-minutes: 45` queda muy holgado. (`git status` marca `ci.yml` como
modificado en esta rama, pero `git diff` no muestra cambios de contenido: probablemente fin de línea.)

### 6.8 Fiabilidad: ejecuciones recientes y flakiness

Últimas 8 ejecuciones del flujo `CI`: **4 éxito, 3 fallo, 1 cancelada**.

| Ejecución                                            | Resultado                                                                                 | Causa observada                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Merge … PR #7` en **`main`** (la más reciente)      | **FALLO** (E2E)                                                                           | `s2-catalog-complete.spec.ts`: 52 pasaron, **1 flaky**, **1 falló**, **5 no se ejecutaron** (modo serial). Mismo código que la ejecución de `develop` 19 minutos antes, que pasó 59/59 |
| `release … a main` (`develop`) y `Merge … PR` previo | éxito (59/59)                                                                             |                                                                                                                                                                                        |
| `feat: productos en tarjetas…` (rama)                | éxito con **1 flaky** (58 + 1)                                                            |                                                                                                                                                                                        |
| `Merge: Fase 1 integrada (PR #5)` (`develop`)        | FALLO (E2E)                                                                               | `s2` («Guardar valor» ×2 y `menu` no visible) y `stock-entries-import` («Ficha incompleta»), 3 fallos                                                                                  |
| `feat: Fase 1 integrada`                             | éxito / 1 cancelada / 1 fallo en el paso de pruebas (a los 4 min; causa no inspeccionada) |                                                                                                                                                                                        |

**Fallos concretos (leídos del log):**

1. `s2-catalog-complete.spec.ts:42` — `strict mode violation: getByRole('button', {name:'Guardar valor'}) resolved to 2
elements` en `addAttributeValue`: se abre el siguiente «Agregar valor a …» antes de que el formulario anterior
   se cierre tras guardar. **Flaky de prueba** (aparece también en PR #5).
2. `s2-catalog-complete.spec.ts:128` — tras `fill('')` + «Buscar» y `selectOption('incomplete')`,
   `productTile('E2E Anillo repetido')` no aparece en 10 s. **Hipótesis (no verificada)**: `updateParams` de
   `ProductsPage` construye la URL desde `params` de la **renderización anterior**; si el cambio del selector ocurre
   antes de que el router refleje `q=''`, la URL conserva `q=<SKU>` y la lista filtra por ambos criterios. Un
   `setParams(prev => …)` (forma funcional) lo eliminaría. Si se confirma, sería un defecto real de UI y no solo de la prueba.
3. `stock-entries-import.spec.ts` (PR #5): `Ficha incompleta` no aparece / aviso inesperado (`Aviso`).

**Causas de flakiness conocidas por el equipo** (documentadas en los comentarios de la configuración y en `TESTING.md`):

| Causa                                        | Efecto                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Carrera de listas con `keepPreviousData`** | La lista anterior permanece visible hasta que llega la nueva: una aserción puede evaluarse contra datos viejos (o dos formularios/listas coexisten un instante, como en «Guardar valor» ×2)                                                             |
| **Caché de 30 s** (`staleTime`)              | Tras una mutación en otra pantalla, una vista fresca no se vuelve a pedir; el E2E puede ver datos previos hasta que se invalide la clave                                                                                                                |
| **Orden alfabético en serie**                | `dashboard` debe preceder a `stock-*`, `s2`, `pricing`…; añadir un spec que cree productos con un nombre alfabéticamente anterior rompe los totales exactos. Los specs `stock-counts`, `stock-entries*` y `stock-exchanges` **modifican el stock DEMO** |
| **Argon2 en cada `login`**                   | 12 specs inician sesión por UI; con CPU cargada superaba los 5 s por aserción (por eso `expect` está a 10 s)                                                                                                                                            |
| **Reintento en modo serial**                 | Con `retries: 1`, un fallo reejecuta **todo** el bloque `serial`, sobre una BD ya modificada por el primer intento                                                                                                                                      |
| Fuentes del runner                           | Linux usa tipografías más anchas; se añadió la pasada de «tipografía ancha» en `responsive.spec`                                                                                                                                                        |

### 6.9 Cobertura funcional y huecos

**Bien cubierto:** autenticación y permisos por rol (API en **todas** las rutas + web + E2E), regla de stock y
movimientos (ledger, concurrencia, saldo ≥ 0), ingresos y costos, ajustes, conteo a ciegas, precios, auditoría
(redacción), fotos (seguridad de archivo), etiquetas.

**Huecos (verificados contra la lista de archivos):**

| Hueco                                                                                                                                                                                              | Riesgo                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Sin cobertura instrumentada ni umbral                                                                                                                                                              | No se puede afirmar el % real                                                                         |
| `users` sin prueba de componente; `inventory-page`, `adjustments-page`, `adjustment-new-page`, `categories-page`, `attributes-page`, `product-form`, `variant-row`, `stock-entries/*` solo por E2E | Regresiones de UI sin red de seguridad rápida (la ruta más sensible, `/inventario`, depende de 2 E2E) |
| `api-client`, `paging`, hooks (`use-*.ts`) sin prueba unitaria (salvo `use-products`)                                                                                                              | Cambios en invalidaciones o claves no se detectan                                                     |
| Sin prueba automática de accesibilidad (axe), de teclado ni de lector de pantalla                                                                                                                  | Los criterios de la sección 4.4 dependen de revisión manual                                           |
| E2E sin: ID de producto inexistente, volver con filtros, sesión vencida a media pantalla (401 global solo con prueba unitaria), fallo de descarga de un chunk                                      | Comportamientos nuevos sin recorrido de extremo a extremo                                             |
| `responsive.spec` omite 6 pantallas (etiquetas, precios, conteos, ficha, detalle de ajuste, detalle de conteo)                                                                                     | Desbordes sin detectar en las pantallas más recientes                                                 |
| Cambio de pieza (`exchanges`) sin pantalla: solo API + etiquetas en el historial                                                                                                                   | Funcionalidad parcialmente ejercida por UI                                                            |
| Migración de datos de «ingresos v2» verificada a mano (no automatizable con `migrate deploy` desde vacío)                                                                                          | Anotado en `TESTING.md`                                                                               |
| Sin pruebas de carga ni de rendimiento (presupuestos de _bundle_ no automatizados)                                                                                                                 | El tamaño puede crecer sin alarma                                                                     |

---

## 7. Deuda del frontend y estimación

Estado de los hallazgos de la revisión frontend (`review-frontend`): **resueltos** en el código actual: rutas
perezosas (P-01), `keepPreviousData` (Q-01), `staleTime`/`gcTime` (Q-02), 401 global (Q-07), `errorElement` (A-06), colores
`brand-200/800` y contraste (A-05, A-12), tarjeta accesible y con insignias (A-01, A-08), container queries (A-09), filtros de
Productos en la URL (Q-03 parcial), `initialData` del detalle (Q-04), `stockLevel` de la API en lugar de recalcular (L-01),
`useActiveSuppliers` (Q-05), invalidación de `approvals` (Q-06), `Pagination`/`PAGE_SIZE`/`format.ts` (D-01, D-02),
título y foco por ruta (A-04), `Input` con `aria-describedby` (A-10), pruebas de `products-page` y `product-detail-page`
(T-01, T-02), `isSafePhotoUrl` (S-01), prioridad de la imagen principal y `memo(ProductCard)` (P-12, P-13).

**Pendiente** (con estimación de esfuerzo; **juicio del autor**, en días-persona de un desarrollador con el código conocido):

| #   | Deuda                                              | Evidencia                                                                                                                                | Qué hacer                                                                                                                                                                                            | Estim.                                                                                                        |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **`ConfirmDialog`** (D-07)                         | 10 `window.confirm` + 2 `alertdialog` inline sin foco ni Esc                                                                             | Componente sobre `<dialog>` con foco gestionado y `useConfirm()`; reemplazar los 12 sitios; pruebas y ajuste de los E2E que aceptan el diálogo nativo (`page.once('dialog', …)`: 11 usos en 8 specs) | 1,5 – 2                                                                                                       |
| 2   | **`PieceSummary` / `variantName`** (D-03)          | Bloque foto + producto + variante en 15 pantallas; `'Única'` literal 22 veces en 15 archivos                                             | Componente `PieceSummary` (foto, nombre, etiqueta de variante, SKU) y helper `variantName`                                                                                                           | 1                                                                                                             |
| 3   | **`useCodePicker` / `VariantPicker` único** (D-04) | `VariantPicker` duplicado (`adjustment-new-page`, `stock-entry-items`) con endpoints distintos; el lector se reimplementa en 5 pantallas | Hook + componente comunes (exactitud, Enter, foco, errores)                                                                                                                                          | 1 – 1,5                                                                                                       |
| 4   | **`QueryState`** (D-05)                            | 33 «Cargando», 17 «Reintentar», 72 `role="alert"` copiados                                                                               | Componente de carga/vacío/error con `aria-busy` y reintento                                                                                                                                          | 1 – 1,5                                                                                                       |
| 5   | **Componentes > 400 líneas** (D-10)                | 8 archivos (sección 3.3)                                                                                                                 | Dividir por responsabilidad (p. ej. `attributes-page` en 3, `product-form` en secciones, `capture-screen` en `ScanInput` + `CountedTable` + feedback)                                                | 4 – 5 (≈0,5 c/u)                                                                                              |
| 6   | **Miniaturas y caché de portadas** (P-02/03/04)    | `/cover` `no-cache`, imagen 1200 px mostrada a 40–235 px                                                                                 | **Backend**: `?w=160                                                                                                                                                                                 | 320`con`sharp`, `coverPhotoId`en listados y URL inmutable por id. **Web**:`srcset`y`ProductThumb` en listados | 1 (API) + 1 (web) |
| 7   | **Conteo: rendimiento** (P-05/06/07)               | `code` en raíz, `invalidate` por lectura, `AudioContext` por lectura                                                                     | `ScanInput` + tabla `memo`, `setQueryData` fusionando el resultado, un `AudioContext` compartido                                                                                                     | 1                                                                                                             |
| 8   | **Etiquetas: impresión** (P-08/09)                 | `LabelPrintArea` siempre montada; búsquedas de `?codes=` en serie                                                                        | Montar al imprimir (`beforeprint`/estado), `Promise.all` o pasar el estado por navegación, caché del patrón                                                                                          | 0,5                                                                                                           |
| 9   | **Resto de listas en la URL** (Q-03)               | Inventario, Ajustes, Conteos, Ingresos, Proveedores, Usuarios, Precios en estado local                                                   | `useListFilters` sobre `useSearchParams` (con forma funcional)                                                                                                                                       | 1,5 – 2                                                                                                       |
| 10  | **UI base faltante** (D-06, D-08, D-09)            | 33 `select`, 7 `textarea`, ~64 tarjetas, 6 «enlace-botón» copiados                                                                       | `Select`, `Textarea`, `Card`, `ButtonLink`, `usePermissions()`                                                                                                                                       | 1,5                                                                                                           |
| 11  | **Pestañas de Precios con teclado** (A-03/A-11)    | `tablist` sin flechas ni _roving tabindex_; paneles sin foco                                                                             | Patrón ARIA de pestañas; foco al abrir paneles                                                                                                                                                       | 0,5                                                                                                           |
| 12  | **Servidor de estáticos** (P-14)                   | `max-age=0`, sin compresión                                                                                                              | `@fastify/static` con caché larga para `/assets` hasheados y compresión (o en el proxy) — coordinar con backend/devops                                                                               | 0,5                                                                                                           |
| 13  | **Inicio: resumen** (P-10)                         | 7 peticiones y hasta 200 filas                                                                                                           | Endpoint `/inventory/summary` (backend) y limitar la tabla a 25                                                                                                                                      | 0,5 + 0,5                                                                                                     |
| 14  | **Estabilizar E2E**                                | `s2` flaky en 3 de las últimas ejecuciones                                                                                               | Esperar el cierre del formulario antes del siguiente (`toBeHidden`); revisar `updateParams` funcional; un `login` compartido (`e2e/helpers.ts`) y estado de sesión reutilizable                      | 1 – 2                                                                                                         |
| 15  | **Pruebas faltantes**                              | Sección 6.9                                                                                                                              | Componentes de `inventory-page`, `variant-row`, `users`, `stock-entry-page`; `axe` en E2E; E2E de sesión vencida y de chunk caído                                                                    | 3 – 4                                                                                                         |
| 16  | **`manualChunks` de _vendor_**                     | 153 kB de React/Query/Zod mezclados con módulos pequeños                                                                                 | Separar `vendor` con caché propia                                                                                                                                                                    | 0,25                                                                                                          |
| 17  | **Búsqueda de variantes** (Q-08)                   | `searchVariants` pide `/products` completos para elegir una variante                                                                     | Endpoint de búsqueda ligero (backend)                                                                                                                                                                | 0,5 + 0,25                                                                                                    |

Orden recomendado: 14 → 1 → 4 → 3 → 6 → 9 → 7 → 5 → 15 (primero estabilizar el CI, luego componentes compartidos que reducen superficie
de las divisiones y de las pruebas). **Total estimado ≈ 20 – 26 días-persona** si se hace todo; los puntos 1, 3, 4, 7, 14 (≈ 5,5 – 8 días)
dan la mayor mejora de robustez/experiencia para uso intensivo con lector.

---

## 8. Incoherencias entre el frontend y la documentación

| #   | Documento                                      | Dice                                                                                                                     | Realidad verificada                                                                                                                                                                                           |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/testing/TESTING.md` (Conteo físico)      | cita `inventory-counts.spec.ts`                                                                                          | **No existe**; el spec es `stock-counts.spec.ts` (única referencia a un archivo de prueba inexistente en todos los documentos)                                                                                |
| 2   | `TESTING.md`                                   | «La suite web usa un worker **thread** compartido…»                                                                      | `vite.config.ts`: `pool: 'forks'`, `maxWorkers: 1`, `isolate: false`                                                                                                                                          |
| 3   | `TESTING.md` (Responsive)                      | recorre **9 pantallas**                                                                                                  | `responsive.spec.ts` recorre **15 rutas + detalle de ingreso = 16** en 5 anchos                                                                                                                               |
| 4   | `TESTING.md` (tabla de niveles)                | Unitarias: «…Futuro: cálculos de costos, transiciones de estado»; Componentes `src/**/*.test.tsx`                        | Esas unitarias **ya existen** (`costing`, `count-logic`, `stock-ledger`…, 140 pruebas); de los 34 archivos web, **9 son `.test.ts`** (lógica pura)                                                            |
| 5   | `TESTING.md` y `CLAUDE.md`                     | E2E se ejecuta con `npm run test:e2e`                                                                                    | `playwright.config.ts` **lanza un error** si faltan `SEED_ADMIN_*`/`AUTH_SECRET`/`TEST_DATABASE_URL`: se debe usar `npm run qa:e2e` (o definirlas)                                                            |
| 6   | `docs/engineering/VERIFICATION-PLAN.md`        | «no existe paso E2E en CI»; Playwright «reutiliza servidores y declara BD de desarrollo»                                 | `ci.yml` tiene el paso `npm run qa:e2e`; `reuseExistingServer: false` y BD efímera (el documento es una foto histórica de octubre)                                                                            |
| 7   | `docs/engineering/PHASE-1-PREPARATION.md`      | chunk de 656/669 kB «pendiente de revisar»                                                                               | Resuelto: rutas perezosas; el mayor chunk es 370 kB y la carga inicial 530 kB                                                                                                                                 |
| 8   | `docs/architecture/ARCHITECTURE.md`            | `pages/` = «páginas genéricas (inicio, 404)»; módulos de Fase 1 «no implementados aún»                                   | `pages/` solo tiene `not-found-page.tsx` (Inicio vive en `features/dashboard`); los módulos están implementados. El documento no menciona `lazyPage`, `table-cards` ni la caché                               |
| 9   | `.claude/skills/frontend-development/SKILL.md` | Ejemplo `RequireAuth` directo; fábrica `supplierKeys`; formato con `Intl` en línea; lector con `autoFocus` + `onKeyDown` | Rutas con `lazyPage(loader, guard)`; claves como arreglos literales por hook (sin fábrica); `lib/format.ts`; el lector usa `<form onSubmit>` con `ref.focus()`                                                |
| 10  | `CHANGELOG.md` (Diseño responsive)             | tablas → tarjetas en «Inventario, Movimientos, Usuarios, Proveedores y el dashboard»                                     | Hoy son **20 tablas** con `table-cards`                                                                                                                                                                       |
| 11  | `CHANGELOG.md` (S3 Fotos)                      | «`PhotoUploader` aún no conectado al alta rápida»                                                                        | Ya está conectado en `quick-create-piece.tsx`                                                                                                                                                                 |
| 12  | `.github/workflows/ci.yml` (comentario)        | «Calidad ~12 min + E2E ~17 min en local»                                                                                 | En CI: tests ≈ 2–3 min y E2E ≈ 7,5 min; el job completo ≈ 14–20 min                                                                                                                                           |
| 13  | `CLAUDE.md` (alcance) vs `app-shell.tsx`       | «NO hacer: punto de venta…, devoluciones»                                                                                | El menú muestra a **todos** los usuarios un grupo «Ventas» (Punto de venta, Historial, Devoluciones) como «Próximamente»; el cuestionario al cliente (K1) lo deja como pregunta abierta                       |
| 14  | `CLAUDE.md` («Fase actual»)                    | «F1-01 Proveedores implementado y F1-02 Usuarios en desarrollo»                                                          | La Fase 1 completa está integrada en `main` (catálogo, ingresos, precios, ajustes, conteos, auditoría, fotos)                                                                                                 |
| 15  | `docs/testing/TESTING.md`                      | El orden alfabético exige `dashboard` antes de `responsive`, etc.                                                        | Correcto, pero no menciona que `auth.spec` y `dashboard.spec` son los únicos con datos DEMO intactos requeridos y que `retries: 1` reejecuta bloques `serial` completos (causa de fallos intermitentes en CI) |

---

## Anexo A — Comandos de verificación usados

```bash
# Conteo de pruebas (no ejecuta nada)
grep -rhE "^\s*(it|test)\(" apps/web/src --include=*.test.ts --include=*.test.tsx | wc -l      # 209
grep -rhE "^\s*(it|test)\(" apps/api/test/integration --include=*.test.ts | wc -l              # 350
npx vitest list --project unit --json                                                           # 124 (+16 por it.each)
npx playwright test --list                                                                      # 59 tests in 18 files
# Bundle (carpeta temporal, no toca apps/web/dist)
npx vite build --outDir <carpeta-temporal> --emptyOutDir
# CI real
gh run list --limit 8 ; gh run view <id> --json jobs ; gh run view <id> --log-failed
```

## Anexo B — Fuentes principales

`apps/web/src/app/{router,lazy-page,app-shell,query-client,route-error}.ts(x)`, `apps/web/src/lib/*`,
`apps/web/src/components/ui/*`, `apps/web/src/features/*/use-*.ts`, `apps/web/src/index.css`,
`apps/web/vite.config.ts`, `apps/web/playwright.config.ts`, `apps/api/vitest.config.ts`, `apps/api/test/helpers/*`,
`apps/api/src/modules/catalog/photos/photos.routes.ts` (cabeceras de `/cover`), `apps/api/src/app.ts` (estáticos y
`Cache-Control`), `scripts/qa.mjs`, `.github/workflows/ci.yml`, `docs/testing/TESTING.md`.

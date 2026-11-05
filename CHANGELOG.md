# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado

- **S1 · Reglas base transversales** (decisiones del cliente del 2026-11-05):
  - Sesión **fija de 8 horas** desde el login, sin extensión por actividad (P-19, Q-02); `SESSION_TTL_HOURS` solo acepta `8`. ADR-003 enmendado.
  - `CHECK (quantity >= 0)` en `inventory_balances` (P-08): el stock negativo es imposible a nivel de base de datos.
  - No se puede desactivar un producto ni una variante con stock > 0 (P-22): nuevos `PATCH /products/:id` con `status` y `PATCH /products/variants/:id/status`, error `STOCK_BLOCKS_DEACTIVATION` y botones deshabilitados con explicación en Productos.
  - Contraseña olvidada (F2): el Administrador restablece la clave de otra persona con una clave temporal (`POST /users/:id/reset-password`); el usuario queda con `must_change_password`, la API solo atiende `/auth/*` (`PASSWORD_CHANGE_REQUIRED`) y la web fuerza una pantalla de cambio antes de cualquier otra ruta. `POST /auth/login` ahora responde `200 { data: { mustChangePassword } }` (antes `204`) y `GET /auth/me` incluye `mustChangePassword`.
  - Pruebas de que el Vendedor no recibe costos ni valorizaciones en ninguna respuesta (Q-15.2) y de la matriz de permisos por defecto (la auditoría es solo del Administrador, Q-15.3).
- Ajustes manuales de inventario con solicitud y aprobación ([ADR-017](docs/decisions/ADR-017-ajustes-solicitud-aprobacion.md), Q-01 B): el Responsable solicita (`inventory:adjust`) y solo el Administrador aprueba o rechaza (permiso nuevo `inventory:adjust-approve`); el stock cambia únicamente al aprobar. Documento `AJ-000001` con varias líneas, catálogo de motivos (Robo, Pérdida, Muestra, Rotura, Error de registro, Otro; «Otro» exige observación) más texto libre, cantidad anterior/nueva, auditoría y movimientos `ADJUSTMENT` atómicos. Nunca deja stock negativo: se valida al solicitar y se revalida al aprobar con el saldo vigente (con concurrencia segura). Pantallas `/inventario/ajustes` (lista con filtros y tarjetas en móvil, contador de pendientes para el Administrador), `/nuevo` (lector de códigos como teclado) y detalle con Aprobar/Rechazar/Cancelar según permiso; atajo «Ajustar a cero» en Inventario. Nueva operación genérica `applyStockChanges` (`modules/inventory/stock-ledger.ts`), tablas `adjustment_reasons`, `inventory_adjustments` e `inventory_adjustment_items` con CHECK y triggers de inmutabilidad. El rol Responsable pasa a tener `inventory:adjust` (también habilita el stock inicial). Datos DEMO con dos ajustes pendientes y uno aprobado.
- Despliegue local con un comando (`npm run local:up`, `local:status`, `local:logs`, `local:down`, `local:reset`): crea `.env` con secretos aleatorios, levanta PostgreSQL y la aplicación (imagen de producción o API local), aplica migraciones y datos iniciales y espera a que responda. Ver [docs/deployment/LOCAL.md](docs/deployment/LOCAL.md). El puerto de la imagen es configurable (`APP_PORT`) y queda ligado solo a `127.0.0.1`.
- Ingresos de mercadería (roadmap, orden 2): borrador editable con proveedor, documento y costos adicionales (transporte, embolsado, extras), ítems con cantidad esperada/recibida y costo de compra, vista previa del reparto, confirmación única y cancelación de borradores. Al confirmar, en una sola transacción: reparte los costos por valor de compra (centavos por mayor resto), registra un movimiento por ítem, aumenta el saldo y fija el último costo; no cambia el precio de venta. Permiso propio para confirmar (`stock-entries:confirm`). Bloquea la confirmación con costos adicionales y valor de compra cero ([ADR-015](docs/decisions/ADR-015-reparto-centavos-y-valor-cero.md)).
- Interfaz renovada: panel lateral navegable (fijo en escritorio, cajón en móvil, módulos futuros como «Próximamente») y dashboard de inicio con métricas de stock, anillo de distribución y tabla de piezas en alerta con ordenamiento y estados de carga, error y vacío. Usa `lucide-react` para los íconos.
- Diseño responsive: las tablas de datos (Inventario, Movimientos, Usuarios, Proveedores y el dashboard) se convierten en tarjetas cuando el **contenido** mide menos de 896 px (container queries; con el panel lateral fijo una pantalla de 1024 px deja solo ~700 px útiles); botones y campos con área táctil mínima de 40 px; el dashboard conserva el ordenamiento en móvil con un selector. Cubierto por `responsive.spec.ts` (5 anchos × 9 pantallas: sin desbordes ni controles recortados).
- Inventario: historial global de movimientos (pantalla `/inventario/movimientos` y `GET /api/v1/inventory/movements`), filtro `initialOnly` para las variantes que aún admiten stock inicial y disponibilidad (cantidad y nivel) por variante en el catálogo, visible solo para quien también puede leer inventario.
- Decisiones del cliente del 2026-10-11 registradas: precio base, prorrateo por valor y último costo (ADR-013), conteos con conciliación de movimientos (ADR-014). Aún no implementadas.
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

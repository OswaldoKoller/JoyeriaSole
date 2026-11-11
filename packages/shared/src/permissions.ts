/**
 * Catálogo de permisos del sistema.
 *
 * Convención: `<recurso>:<acción>`. El backend autoriza SIEMPRE por permiso (nunca por nombre de
 * rol); los roles son solo agrupaciones de permisos guardadas en base de datos.
 *
 * Agregar un permiso nuevo = agregarlo aquí + volver a ejecutar el seed (es idempotente).
 */
export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  /** Ver roles, sus permisos y cuántos usuarios los tienen (P-46). Solo el Administrador. */
  ROLES_READ: 'roles:read',
  ROLES_MANAGE: 'roles:manage',

  CATALOG_READ: 'catalog:read',
  CATALOG_MANAGE: 'catalog:manage',
  /** Eliminar físicamente una ficha sin movimientos ni referencias (B11). Solo Administrador. */
  CATALOG_DELETE: 'catalog:delete',
  /** Ver costos de compra. Separado de catalog:read porque puede ser información sensible. */
  COSTS_READ: 'costs:read',
  /** Solicitar cambios de precio de venta (el Administrador los aprueba). ADR-018. */
  PRICES_PROPOSE: 'prices:propose',
  /** Aprobar o rechazar solicitudes de precio, cambiar precios directamente y fijar el precio inicial. */
  PRICES_APPROVE: 'prices:approve',

  SUPPLIERS_READ: 'suppliers:read',
  SUPPLIERS_MANAGE: 'suppliers:manage',

  STOCK_ENTRIES_READ: 'stock-entries:read',
  STOCK_ENTRIES_MANAGE: 'stock-entries:manage',
  /** Confirmar un ingreso: es lo único que incrementa el stock. */
  STOCK_ENTRIES_CONFIRM: 'stock-entries:confirm',

  INVENTORY_READ: 'inventory:read',
  /** Solicitar ajustes manuales. El stock NO cambia hasta que se aprueba. */
  INVENTORY_ADJUST: 'inventory:adjust',
  /** Cargar el stock inicial de una pieza (cambia el stock sin aprobación previa). ADMIN y Responsable. */
  INVENTORY_INITIAL_STOCK: 'inventory:initial-stock',
  /** Aprobar o rechazar ajustes: es lo único que mueve stock en un ajuste (ADR-017). ADMIN y Responsable (regla 2026-11-05). */
  INVENTORY_ADJUST_APPROVE: 'inventory:adjust-approve',
  /** Registrar un cambio de pieza (entra la devuelta, sale la entregada). Mueve stock (ADR-019). */
  INVENTORY_EXCHANGE: 'inventory:exchange',

  INVENTORY_COUNTS_READ: 'inventory-counts:read',
  INVENTORY_COUNTS_MANAGE: 'inventory-counts:manage',
  /** Aprobar un conteo físico: es lo único que genera los ajustes de stock del conteo (ADR-021). */
  INVENTORY_COUNTS_APPROVE: 'inventory-counts:approve',

  AUDIT_READ: 'audit:read',

  /** Configuración del sistema (tipos de costo de ingreso, datos del negocio). Solo el Administrador. */
  SETTINGS_MANAGE: 'settings:manage',

  // Ventas y caja (plan 11 de fase-2-ventas, autorizado el 2026-11-10). Una venta confirmada no se
  // anula ni se modifica (DEC-V07): no existe ningún permiso de reversión.
  /** Registrar ventas de mostrador y consultar si hay caja abierta (D-01, pendiente de confirmación). */
  SALES_CREATE: 'sales:create',
  /** Ver las ventas propias y su comprobante (D-02). */
  SALES_READ: 'sales:read',
  /** Ver las ventas de todos los vendedores (D-02). */
  SALES_READ_ALL: 'sales:read-all',
  /** Ver sesiones de caja, arqueos y correcciones (D-13). */
  CASH_READ: 'cash:read',
  /** Abrir la caja con su fondo inicial (B3). */
  CASH_OPEN: 'cash:open',
  /** Cerrar la caja y registrar el arqueo (B3). */
  CASH_CLOSE: 'cash:close',
  /** Corregir errores de captura de un cierre (append-only). Exclusivo del Administrador (B6/B7). */
  CASH_CORRECT: 'cash:correct',
  /** Reportar una incidencia de venta (solo trazabilidad, C6). */
  SALES_INCIDENTS_REPORT: 'sales-incidents:report',
  /** Ver, atender y cerrar incidencias de venta. Exclusivo del Administrador (C6). */
  SALES_INCIDENTS_MANAGE: 'sales-incidents:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'users:read': 'Ver usuarios',
  'users:manage': 'Crear, editar y desactivar usuarios',
  'roles:read': 'Ver roles y sus permisos',
  'roles:manage': 'Administrar roles y sus permisos',
  'catalog:read': 'Ver catálogo (categorías, atributos, productos, variantes)',
  'catalog:manage': 'Crear y editar catálogo',
  'catalog:delete': 'Eliminar fichas de producto sin movimientos',
  'costs:read': 'Ver costos de compra',
  'prices:propose': 'Solicitar cambios de precio de venta',
  'prices:approve': 'Aprobar o rechazar cambios de precio y cambiar precios directamente',
  'suppliers:read': 'Ver proveedores',
  'suppliers:manage': 'Crear y editar proveedores',
  'stock-entries:read': 'Ver ingresos de mercadería',
  'stock-entries:manage': 'Registrar y editar ingresos en borrador',
  'stock-entries:confirm': 'Confirmar ingresos (actualiza stock)',
  'inventory:read': 'Ver stock y movimientos',
  'inventory:adjust': 'Solicitar ajustes de inventario',
  'inventory:initial-stock': 'Cargar el stock inicial de una pieza (modifica el stock)',
  'inventory:adjust-approve': 'Aprobar o rechazar ajustes de inventario (modifica el stock)',
  'inventory:exchange': 'Registrar cambios de pieza (modifica el stock de dos variantes)',
  'inventory-counts:read': 'Ver conteos físicos',
  'inventory-counts:manage': 'Crear conteos físicos y capturar piezas',
  'inventory-counts:approve': 'Aprobar conteos físicos (ajusta el stock) y regularizar hallazgos',
  'audit:read': 'Ver registro de auditoría',
  'settings:manage':
    'Administrar la configuración del sistema (tipos de costo de ingreso, datos del negocio)',
  'sales:create': 'Registrar ventas de mostrador y consultar si hay caja abierta',
  'sales:read': 'Ver las ventas propias y su comprobante',
  'sales:read-all': 'Ver todas las ventas',
  'cash:read': 'Ver sesiones de caja, arqueos y correcciones',
  'cash:open': 'Abrir la caja',
  'cash:close': 'Cerrar la caja y registrar el arqueo',
  'cash:correct': 'Corregir errores de captura de un cierre de caja (contado, fondo, observación)',
  'sales-incidents:report': 'Reportar una incidencia de venta',
  'sales-incidents:manage': 'Ver, atender y cerrar incidencias de venta',
};

/**
 * Permisos EXCLUSIVOS del Administrador por decisión del responsable: la pantalla de roles no los
 * concede a ningún otro rol (ni de sistema ni personalizado) y la API lo rechaza (P-46).
 *   - `cash:correct`: solo el Administrador corrige cierres de caja (aclaración B6/B7, R-17).
 *   - `sales-incidents:manage`: las incidencias las ve, atiende y cierra el Administrador (C6, R-09).
 *   - `settings:manage`: la configuración del sistema es exclusiva del Administrador (R-27).
 */
export const ADMIN_ONLY_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CASH_CORRECT,
  PERMISSIONS.SALES_INCIDENTS_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
];

/** `true` si el permiso solo puede tenerlo el rol Administrador. */
export function isAdminOnlyPermission(code: string): boolean {
  return (ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(code);
}

export const ROLES = {
  ADMIN: 'ADMIN',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  SELLER: 'SELLER',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/**
 * Asignación PRELIMINAR de permisos por rol.
 *
 * Respuestas del cliente (2026-10-09): vendedor sin costos (P-02), responsable de almacén
 * puede aprobar sus propios conteos físicos (P-01 parcial). Reunión 2026-11-05 (Q-01 B): los
 * ajustes manuales los solicita el Responsable y los aprueban el Administrador y el Responsable de
 * inventario (regla posterior del 2026-11-05).
 * Ventas y caja (plan 11, §4.1): venden el Vendedor, el Responsable y el Administrador (D-01, POR
 * DEFECTO — PENDIENTE DE CONFIRMACIÓN); el Vendedor solo ve sus ventas (D-02); abren y cierran caja
 * el Administrador y el Responsable (B3); solo el Administrador corrige cierres y gestiona
 * incidencias (`ADMIN_ONLY_PERMISSIONS`).
 * Conteo físico (E6/Q-01 B, ADR-021): el Responsable también aprueba los conteos.
 * Solo se usa en el seed; luego los roles se administran en base de datos y en la pantalla «Roles»
 * (P-46). El seed solo AGREGA a los roles de sistema los permisos que les falten (nunca quita).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  RoleCode,
  { name: string; description: string; permissions: readonly Permission[] }
> = {
  ADMIN: {
    name: 'Administrador',
    description: 'Acceso total al sistema',
    permissions: ALL_PERMISSIONS,
  },
  INVENTORY_MANAGER: {
    name: 'Responsable de inventario',
    description: 'Gestiona catálogo, proveedores, ingresos e inventario',
    permissions: [
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.CATALOG_MANAGE,
      PERMISSIONS.COSTS_READ,
      PERMISSIONS.PRICES_PROPOSE,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_MANAGE,
      PERMISSIONS.STOCK_ENTRIES_READ,
      PERMISSIONS.STOCK_ENTRIES_MANAGE,
      PERMISSIONS.STOCK_ENTRIES_CONFIRM,
      PERMISSIONS.INVENTORY_READ,
      // Regla 2026-11-05 (tras Q-01 B): el Responsable también autoriza —ajustes, precios, stock
      // inicial y conteos—, para que ningún trámite quede bloqueado esperando solo al Administrador.
      // Lo único exclusivo del Administrador sigue siendo auditoría, usuarios/roles y borrado físico.
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_ADJUST_APPROVE,
      PERMISSIONS.INVENTORY_INITIAL_STOCK,
      PERMISSIONS.PRICES_APPROVE,
      // Registra cambios de pieza (ADR-019). El Vendedor NO: quién los registra en el punto de venta
      // futuro está pendiente (P-30).
      PERMISSIONS.INVENTORY_EXCHANGE,
      PERMISSIONS.INVENTORY_COUNTS_READ,
      PERMISSIONS.INVENTORY_COUNTS_MANAGE,
      PERMISSIONS.INVENTORY_COUNTS_APPROVE,
      // Ventas y caja (plan 11 §4.1): vende (D-01), ve todas las ventas (D-02), abre, cierra y
      // consulta la caja (B3, D-13) y reporta incidencias (C6). NO corrige cierres ni gestiona
      // incidencias (exclusivos del Administrador).
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_READ_ALL,
      PERMISSIONS.CASH_READ,
      PERMISSIONS.CASH_OPEN,
      PERMISSIONS.CASH_CLOSE,
      PERMISSIONS.SALES_INCIDENTS_REPORT,
    ],
  },
  SELLER: {
    name: 'Vendedor',
    description: 'Consulta de catálogo y stock, venta de mostrador y sus propias ventas.',
    // Sin costos (P-02) ni caja (B3): vende (D-01), ve solo sus ventas (D-02) y reporta incidencias (C6).
    permissions: [
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_INCIDENTS_REPORT,
    ],
  },
};

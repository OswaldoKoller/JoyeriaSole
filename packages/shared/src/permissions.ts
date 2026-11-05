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
  ROLES_MANAGE: 'roles:manage',

  CATALOG_READ: 'catalog:read',
  CATALOG_MANAGE: 'catalog:manage',
  /** Ver costos de compra. Separado de catalog:read porque puede ser información sensible. */
  COSTS_READ: 'costs:read',
  /** Cambiar costo o precio de venta. Toda modificación queda en auditoría. */
  PRICES_MANAGE: 'prices:manage',

  SUPPLIERS_READ: 'suppliers:read',
  SUPPLIERS_MANAGE: 'suppliers:manage',

  STOCK_ENTRIES_READ: 'stock-entries:read',
  STOCK_ENTRIES_MANAGE: 'stock-entries:manage',
  /** Confirmar un ingreso: es lo único que incrementa el stock. */
  STOCK_ENTRIES_CONFIRM: 'stock-entries:confirm',

  INVENTORY_READ: 'inventory:read',
  INVENTORY_ADJUST: 'inventory:adjust',

  INVENTORY_COUNTS_READ: 'inventory-counts:read',
  INVENTORY_COUNTS_MANAGE: 'inventory-counts:manage',
  /** Aprobar diferencias de un inventario físico (genera ajustes). */
  INVENTORY_COUNTS_APPROVE: 'inventory-counts:approve',

  AUDIT_READ: 'audit:read',

  /** Configuración del sistema (p. ej. tipos de costo de ingreso). Solo el Administrador. */
  SETTINGS_MANAGE: 'settings:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'users:read': 'Ver usuarios',
  'users:manage': 'Crear, editar y desactivar usuarios',
  'roles:manage': 'Administrar roles y sus permisos',
  'catalog:read': 'Ver catálogo (categorías, atributos, productos, variantes)',
  'catalog:manage': 'Crear y editar catálogo',
  'costs:read': 'Ver costos de compra',
  'prices:manage': 'Modificar costos y precios de venta',
  'suppliers:read': 'Ver proveedores',
  'suppliers:manage': 'Crear y editar proveedores',
  'stock-entries:read': 'Ver ingresos de mercadería',
  'stock-entries:manage': 'Registrar y editar ingresos en borrador',
  'stock-entries:confirm': 'Confirmar ingresos (actualiza stock)',
  'inventory:read': 'Ver stock y movimientos',
  'inventory:adjust': 'Registrar ajustes de inventario',
  'inventory-counts:read': 'Ver inventarios físicos',
  'inventory-counts:manage': 'Crear inventarios físicos y registrar conteos',
  'inventory-counts:approve': 'Aprobar diferencias de inventario físico',
  'audit:read': 'Ver registro de auditoría',
  'settings:manage': 'Administrar la configuración del sistema (tipos de costo de ingreso)',
};

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
 * puede aprobar sus propios conteos físicos (P-01 parcial). Falta decidir ajustes manuales;
 * el seed aún no agrega inventory-counts:approve al responsable hasta implementar el conteo.
 * Solo se usa en el seed inicial; luego los roles se administran en base de datos.
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
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_MANAGE,
      PERMISSIONS.STOCK_ENTRIES_READ,
      PERMISSIONS.STOCK_ENTRIES_MANAGE,
      PERMISSIONS.STOCK_ENTRIES_CONFIRM,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_COUNTS_READ,
      PERMISSIONS.INVENTORY_COUNTS_MANAGE,
    ],
  },
  SELLER: {
    name: 'Vendedor',
    description: 'Consulta de catálogo y stock. Preparado para el futuro módulo de ventas.',
    permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ],
  },
};

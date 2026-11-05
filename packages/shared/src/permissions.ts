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
  /** Solicitar ajustes manuales (y cargar el stock inicial). El stock NO cambia hasta que se aprueba. */
  INVENTORY_ADJUST: 'inventory:adjust',
  /** Aprobar o rechazar ajustes: es lo único que mueve stock en un ajuste (ADR-017). Solo ADMIN. */
  INVENTORY_ADJUST_APPROVE: 'inventory:adjust-approve',

  INVENTORY_COUNTS_READ: 'inventory-counts:read',
  INVENTORY_COUNTS_MANAGE: 'inventory-counts:manage',
  /** Aprobar un conteo físico: es lo único que genera los ajustes de stock del conteo (ADR-021). */
  INVENTORY_COUNTS_APPROVE: 'inventory-counts:approve',

  AUDIT_READ: 'audit:read',
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
  'inventory:adjust': 'Solicitar ajustes de inventario y cargar stock inicial',
  'inventory:adjust-approve': 'Aprobar o rechazar ajustes de inventario (modifica el stock)',
  'inventory-counts:read': 'Ver conteos físicos',
  'inventory-counts:manage': 'Crear conteos físicos y capturar piezas',
  'inventory-counts:approve': 'Aprobar conteos físicos (ajusta el stock) y regularizar hallazgos',
  'audit:read': 'Ver registro de auditoría',
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
 * puede aprobar sus propios conteos físicos (P-01 parcial). Reunión 2026-11-05 (Q-01 B): los
 * ajustes manuales los solicita el responsable y solo los aprueba el administrador.
 * Conteo físico (E6/Q-01 B, ADR-021): el Responsable también aprueba los conteos.
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
      // Solicita ajustes; aprobarlos es solo del Administrador (Q-01 B, ADR-017).
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_COUNTS_READ,
      PERMISSIONS.INVENTORY_COUNTS_MANAGE,
      PERMISSIONS.INVENTORY_COUNTS_APPROVE,
    ],
  },
  SELLER: {
    name: 'Vendedor',
    description: 'Consulta de catálogo y stock. Preparado para el futuro módulo de ventas.',
    permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.INVENTORY_READ],
  },
};

import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLES,
  type Permission,
  type RoleCode,
} from '../permissions.ts';

/**
 * Gestión de roles por pantalla (P-46, resuelta 2026-11-10). Esquemas y reglas puras compartidas por
 * la API y la web. Las reglas de seguridad se aplican SIEMPRE en la API; la web solo las refleja.
 */

/** Áreas para agrupar las casillas de permisos. El área se deduce del recurso (`<recurso>:<acción>`). */
export const PERMISSION_AREAS = [
  { code: 'access', label: 'Usuarios y roles' },
  { code: 'catalog', label: 'Catálogo, costos y precios' },
  { code: 'purchases', label: 'Proveedores e ingresos' },
  { code: 'inventory', label: 'Inventario y conteos' },
  { code: 'system', label: 'Auditoría y configuración' },
  { code: 'other', label: 'Otros' },
] as const;

export type PermissionAreaCode = (typeof PERMISSION_AREAS)[number]['code'];

const AREA_BY_RESOURCE: Record<string, PermissionAreaCode> = {
  users: 'access',
  roles: 'access',
  catalog: 'catalog',
  costs: 'catalog',
  prices: 'catalog',
  suppliers: 'purchases',
  'stock-entries': 'purchases',
  inventory: 'inventory',
  'inventory-counts': 'inventory',
  audit: 'system',
  settings: 'system',
};

/** Área de un permiso; un recurso nuevo sin mapear cae en «Otros» (nunca se oculta). */
export function permissionArea(code: string): PermissionAreaCode {
  return AREA_BY_RESOURCE[code.split(':')[0] ?? ''] ?? 'other';
}

/** Catálogo de permisos agrupado por área, en el orden de `PERMISSION_AREAS` y de `PERMISSIONS`. */
export function groupPermissions(codes: readonly Permission[] = ALL_PERMISSIONS) {
  return PERMISSION_AREAS.map((area) => ({
    code: area.code,
    label: area.label,
    permissions: codes
      .filter((code) => permissionArea(code) === area.code)
      .map((code) => ({ code, description: PERMISSION_DESCRIPTIONS[code] })),
  })).filter((area) => area.permissions.length > 0);
}

/**
 * Permisos que la pantalla NO puede quitar a un rol:
 * - Administrador: todos (el rol es inmutable).
 * - Otros roles de sistema: los de `DEFAULT_ROLE_PERMISSIONS`, porque el seed idempotente los vuelve
 *   a agregar; quitarlos por pantalla duraría solo hasta el siguiente despliegue.
 * - Roles creados por pantalla: ninguno.
 */
export function lockedPermissionsFor(role: { code: string; isSystem: boolean }): Permission[] {
  if (role.code === ROLES.ADMIN) return [...ALL_PERMISSIONS];
  if (!role.isSystem) return [];
  const defaults = DEFAULT_ROLE_PERMISSIONS[role.code as RoleCode] as
    (typeof DEFAULT_ROLE_PERMISSIONS)[RoleCode] | undefined;
  return defaults ? [...defaults.permissions] : [];
}

const permissionCodeSchema = z.enum(PERMISSIONS, { error: 'Permiso inexistente' });

const permissionListSchema = z
  .array(permissionCodeSchema)
  .min(1, 'Seleccione al menos un permiso')
  .max(ALL_PERMISSIONS.length)
  .refine((codes) => new Set(codes).size === codes.length, 'No repita permisos');

const roleNameSchema = z
  .string()
  .trim()
  .min(1, 'Indique el nombre del rol')
  .max(100, 'El nombre admite hasta 100 caracteres');

const roleDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'La descripción admite hasta 500 caracteres')
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const createRoleSchema = z.object({
  name: roleNameSchema,
  description: roleDescriptionSchema.optional(),
  permissions: permissionListSchema,
});

export const updateRoleSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.optional(),
    permissions: permissionListSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un campo para actualizar');

export const roleDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Rol creado por el seed (Administrador, Responsable, Vendedor): no se renombra ni se elimina. */
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  /** Permisos que no se pueden quitar (ver `lockedPermissionsFor`). */
  lockedPermissions: z.array(z.string()),
  /** Usuarios con el rol (activos e inactivos). Un rol con usuarios no se puede eliminar. */
  userCount: z.number().int(),
});

export const permissionCatalogSchema = z.array(
  z.object({
    code: z.string(),
    label: z.string(),
    permissions: z.array(z.object({ code: z.string(), description: z.string() })),
  }),
);

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type RoleDetail = z.infer<typeof roleDetailSchema>;
export type PermissionCatalog = z.infer<typeof permissionCatalogSchema>;

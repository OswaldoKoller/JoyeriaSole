/** Reglas puras de la gestión de roles por pantalla (P-46): agrupación y permisos bloqueados. */
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  createRoleSchema,
  groupPermissions,
  lockedPermissionsFor,
  permissionArea,
  updateRoleSchema,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';

describe('catálogo de permisos agrupado por área', () => {
  it('incluye cada permiso exactamente una vez, con su descripción en español', () => {
    const codes = groupPermissions().flatMap((area) => area.permissions.map((p) => p.code));
    expect([...codes].sort()).toEqual([...ALL_PERMISSIONS].sort());
    for (const area of groupPermissions()) {
      expect(area.label).toBeTruthy();
      for (const permission of area.permissions) expect(permission.description).toBeTruthy();
    }
  });

  it('agrupa por recurso y manda a «Otros» un recurso desconocido', () => {
    expect(permissionArea(PERMISSIONS.ROLES_MANAGE)).toBe('access');
    expect(permissionArea(PERMISSIONS.COSTS_READ)).toBe('catalog');
    expect(permissionArea(PERMISSIONS.STOCK_ENTRIES_CONFIRM)).toBe('purchases');
    expect(permissionArea(PERMISSIONS.INVENTORY_COUNTS_APPROVE)).toBe('inventory');
    expect(permissionArea(PERMISSIONS.AUDIT_READ)).toBe('system');
    expect(permissionArea('desconocido:leer')).toBe('other');
  });
});

describe('permisos que la pantalla no puede quitar', () => {
  it('el Administrador conserva todos, aunque la fila no esté marcada como de sistema', () => {
    expect(lockedPermissionsFor({ code: 'ADMIN', isSystem: true })).toEqual([...ALL_PERMISSIONS]);
    expect(lockedPermissionsFor({ code: 'ADMIN', isSystem: false })).toEqual([...ALL_PERMISSIONS]);
  });

  it('los demás roles de sistema conservan sus permisos base del seed', () => {
    expect(lockedPermissionsFor({ code: 'SELLER', isSystem: true })).toEqual([
      ...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions,
    ]);
  });

  it('un rol creado por pantalla no tiene permisos bloqueados', () => {
    expect(lockedPermissionsFor({ code: 'CUSTOM_CAJERO', isSystem: false })).toEqual([]);
  });
});

describe('validación de altas y ediciones de roles', () => {
  it('rechaza permisos inexistentes, repetidos o una lista vacía', () => {
    const base = { name: 'Cajero' };
    expect(createRoleSchema.safeParse({ ...base, permissions: ['ventas:todo'] }).success).toBe(
      false,
    );
    expect(
      createRoleSchema.safeParse({
        ...base,
        permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_READ],
      }).success,
    ).toBe(false);
    expect(createRoleSchema.safeParse({ ...base, permissions: [] }).success).toBe(false);
  });

  it('normaliza la descripción vacía a null y exige al menos un campo al editar', () => {
    const parsed = createRoleSchema.parse({
      name: '  Cajero ',
      description: '  ',
      permissions: [PERMISSIONS.CATALOG_READ],
    });
    expect(parsed).toEqual({
      name: 'Cajero',
      description: null,
      permissions: [PERMISSIONS.CATALOG_READ],
    });
    expect(updateRoleSchema.safeParse({}).success).toBe(false);
  });
});

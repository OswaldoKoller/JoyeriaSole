import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';

/** Matriz de permisos por rol de los ajustes (Q-01 B, ADR-017). */
describe('matriz de permisos de ajustes de inventario', () => {
  const has = (role: keyof typeof DEFAULT_ROLE_PERMISSIONS, permission: string) =>
    DEFAULT_ROLE_PERMISSIONS[role].permissions.some((code) => code === permission);

  it('solo el Administrador aprueba ajustes', () => {
    expect(has('ADMIN', PERMISSIONS.INVENTORY_ADJUST_APPROVE)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.INVENTORY_ADJUST_APPROVE)).toBe(false);
    expect(has('SELLER', PERMISSIONS.INVENTORY_ADJUST_APPROVE)).toBe(false);
  });

  it('el Administrador y el Responsable solicitan ajustes; el Vendedor no', () => {
    expect(has('ADMIN', PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(has('SELLER', PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
  });

  it('el Vendedor solo consulta catálogo e inventario', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SELLER.permissions).toEqual([
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.INVENTORY_READ,
    ]);
  });

  it('todo permiso tiene descripción y el Administrador los tiene todos', () => {
    for (const code of ALL_PERMISSIONS) expect(PERMISSION_DESCRIPTIONS[code]).toBeTruthy();
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN.permissions).toEqual(ALL_PERMISSIONS);
  });
});

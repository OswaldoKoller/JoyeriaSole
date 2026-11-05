/**
 * Matriz de permisos por defecto (Q-01, Q-15, P-02). Solo describe lo que el cliente ya decidió:
 * los permisos de aprobar ajustes/precios los añaden otras rebanadas.
 */
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  type Permission,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';

const has = (role: keyof typeof DEFAULT_ROLE_PERMISSIONS, permission: Permission) =>
  DEFAULT_ROLE_PERMISSIONS[role].permissions.includes(permission);

describe('permisos por defecto de los roles', () => {
  it('solo existen los tres roles iniciales (Q-15.4: sin roles adicionales)', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(Object.values(ROLES).sort());
    expect(Object.values(ROLES)).toHaveLength(3);
  });

  it('el Administrador tiene todos los permisos', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.ADMIN.permissions].sort()).toEqual(
      [...ALL_PERMISSIONS].sort(),
    );
  });

  it('la auditoría es solo del Administrador (Q-15.3)', () => {
    expect(has('ADMIN', PERMISSIONS.AUDIT_READ)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.AUDIT_READ)).toBe(false);
    expect(has('SELLER', PERMISSIONS.AUDIT_READ)).toBe(false);
  });

  it('usuarios y roles son solo del Administrador', () => {
    for (const permission of [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.ROLES_MANAGE,
    ]) {
      expect(has('INVENTORY_MANAGER', permission)).toBe(false);
      expect(has('SELLER', permission)).toBe(false);
    }
  });

  it('el Vendedor solo consulta catálogo y stock, sin costos (P-02, Q-15.2)', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions].sort()).toEqual([
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.INVENTORY_READ,
    ]);
    expect(has('SELLER', PERMISSIONS.COSTS_READ)).toBe(false);
  });

  it('el Responsable de inventario ve costos pero no administra usuarios', () => {
    expect(has('INVENTORY_MANAGER', PERMISSIONS.COSTS_READ)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.CATALOG_MANAGE)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.STOCK_ENTRIES_CONFIRM)).toBe(true);
  });
});

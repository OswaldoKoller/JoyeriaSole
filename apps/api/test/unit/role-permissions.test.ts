/**
 * Matriz de permisos por defecto (Q-01, Q-15, P-02). Solo describe lo que el cliente ya decidió:
 * los permisos de aprobar ajustes/precios los añaden otras rebanadas.
 */
import {
  ADMIN_ONLY_PERMISSIONS,
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
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.ROLES_MANAGE,
    ]) {
      expect(has('INVENTORY_MANAGER', permission)).toBe(false);
      expect(has('SELLER', permission)).toBe(false);
    }
  });

  it('el Vendedor consulta catálogo y stock y vende, sin costos (P-02, Q-15.2, D-01, D-02)', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.SELLER.permissions].sort()).toEqual(
      [
        PERMISSIONS.CATALOG_READ,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.SALES_CREATE,
        PERMISSIONS.SALES_READ,
        PERMISSIONS.SALES_EXCHANGE,
        PERMISSIONS.SALES_INCIDENTS_REPORT,
      ].sort(),
    );
    expect(has('SELLER', PERMISSIONS.COSTS_READ)).toBe(false);
  });

  it('eliminar fichas del catálogo (B11) es solo del Administrador', () => {
    expect(has('ADMIN', PERMISSIONS.CATALOG_DELETE)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.CATALOG_DELETE)).toBe(false);
    expect(has('SELLER', PERMISSIONS.CATALOG_DELETE)).toBe(false);
  });

  it('categorías, atributos y stock mínimo los gestiona el Responsable (B1, B10)', () => {
    expect(has('INVENTORY_MANAGER', PERMISSIONS.CATALOG_MANAGE)).toBe(true);
    expect(has('SELLER', PERMISSIONS.CATALOG_MANAGE)).toBe(false);
  });

  it('el Responsable de inventario ve costos pero no administra usuarios', () => {
    expect(has('INVENTORY_MANAGER', PERMISSIONS.COSTS_READ)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.CATALOG_MANAGE)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.STOCK_ENTRIES_CONFIRM)).toBe(true);
  });
});

describe('permisos de ventas y caja (plan 11 §4.1)', () => {
  const CASH = [
    PERMISSIONS.CASH_READ,
    PERMISSIONS.CASH_OPEN,
    PERMISSIONS.CASH_CLOSE,
    PERMISSIONS.CASH_CORRECT,
  ];

  it('solo el Administrador tiene cash:correct y sales-incidents:manage', () => {
    for (const permission of [PERMISSIONS.CASH_CORRECT, PERMISSIONS.SALES_INCIDENTS_MANAGE]) {
      expect(has('ADMIN', permission)).toBe(true);
      expect(has('INVENTORY_MANAGER', permission)).toBe(false);
      expect(has('SELLER', permission)).toBe(false);
    }
  });

  it('el Vendedor no tiene ningún permiso de caja, ni costos, ni ve ventas ajenas', () => {
    for (const permission of CASH) expect(has('SELLER', permission)).toBe(false);
    expect(DEFAULT_ROLE_PERMISSIONS.SELLER.permissions.some((p) => p.startsWith('cash:'))).toBe(
      false,
    );
    expect(has('SELLER', PERMISSIONS.COSTS_READ)).toBe(false);
    expect(has('SELLER', PERMISSIONS.SALES_READ_ALL)).toBe(false);
  });

  it('el Responsable abre, cierra y consulta la caja y ve todas las ventas (B3, D-02, D-13)', () => {
    for (const permission of [
      PERMISSIONS.CASH_OPEN,
      PERMISSIONS.CASH_CLOSE,
      PERMISSIONS.CASH_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_READ_ALL,
      PERMISSIONS.SALES_EXCHANGE,
      PERMISSIONS.SALES_INCIDENTS_REPORT,
    ]) {
      expect(has('INVENTORY_MANAGER', permission)).toBe(true);
    }
  });

  it('los permisos exclusivos del Administrador no figuran en ningún otro rol por defecto', () => {
    expect([...ADMIN_ONLY_PERMISSIONS].sort()).toEqual(
      [
        PERMISSIONS.CASH_CORRECT,
        PERMISSIONS.SALES_INCIDENTS_MANAGE,
        PERMISSIONS.SETTINGS_MANAGE,
      ].sort(),
    );
    for (const permission of ADMIN_ONLY_PERMISSIONS) {
      expect(has('INVENTORY_MANAGER', permission)).toBe(false);
      expect(has('SELLER', permission)).toBe(false);
    }
  });
});

import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
} from '@joyeria/shared';
import { describe, expect, it } from 'vitest';

/** Matriz de permisos por rol de los ajustes (Q-01 B, ADR-017; autorización compartida desde 2026-11-05). */
describe('matriz de permisos de ajustes de inventario', () => {
  const has = (role: keyof typeof DEFAULT_ROLE_PERMISSIONS, permission: string) =>
    DEFAULT_ROLE_PERMISSIONS[role].permissions.some((code) => code === permission);

  it('el Administrador y el Responsable aprueban ajustes (regla 2026-11-05); el Vendedor no', () => {
    expect(has('ADMIN', PERMISSIONS.INVENTORY_ADJUST_APPROVE)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.INVENTORY_ADJUST_APPROVE)).toBe(true);
    expect(has('SELLER', PERMISSIONS.INVENTORY_ADJUST_APPROVE)).toBe(false);
  });

  it('el Administrador y el Responsable solicitan ajustes; el Vendedor no', () => {
    expect(has('ADMIN', PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(has('SELLER', PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
  });

  it('el stock inicial lo cargan el Administrador y el Responsable; el Vendedor no', () => {
    expect(has('ADMIN', PERMISSIONS.INVENTORY_INITIAL_STOCK)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.INVENTORY_INITIAL_STOCK)).toBe(true);
    expect(has('SELLER', PERMISSIONS.INVENTORY_INITIAL_STOCK)).toBe(false);
  });

  it('conteos físicos: el Administrador y el Responsable capturan y aprueban; el Vendedor no (E6, Q-15)', () => {
    for (const role of ['ADMIN', 'INVENTORY_MANAGER'] as const) {
      expect(has(role, PERMISSIONS.INVENTORY_COUNTS_READ)).toBe(true);
      expect(has(role, PERMISSIONS.INVENTORY_COUNTS_MANAGE)).toBe(true);
      expect(has(role, PERMISSIONS.INVENTORY_COUNTS_APPROVE)).toBe(true);
    }
    for (const permission of [
      PERMISSIONS.INVENTORY_COUNTS_READ,
      PERMISSIONS.INVENTORY_COUNTS_MANAGE,
      PERMISSIONS.INVENTORY_COUNTS_APPROVE,
    ]) {
      expect(has('SELLER', permission)).toBe(false);
    }
  });

  it('cambios de pieza: el Administrador y el Responsable los registran; el Vendedor no (ADR-019, P-30)', () => {
    expect(has('ADMIN', PERMISSIONS.INVENTORY_EXCHANGE)).toBe(true);
    expect(has('INVENTORY_MANAGER', PERMISSIONS.INVENTORY_EXCHANGE)).toBe(true);
    expect(has('SELLER', PERMISSIONS.INVENTORY_EXCHANGE)).toBe(false);
  });

  it('el Vendedor consulta catálogo e inventario, vende y reporta incidencias (plan 11 §4.1)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SELLER.permissions).toEqual([
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_EXCHANGE,
      PERMISSIONS.SALES_INCIDENTS_REPORT,
    ]);
  });

  it('el cambio de pieza de una venta lo registran Vendedor, Responsable y Administrador (ADR-026, P-30)', () => {
    for (const role of ['ADMIN', 'INVENTORY_MANAGER', 'SELLER'] as const) {
      expect(has(role, PERMISSIONS.SALES_EXCHANGE), role).toBe(true);
    }
  });

  it('todo permiso tiene descripción y el Administrador los tiene todos', () => {
    for (const code of ALL_PERMISSIONS) expect(PERMISSION_DESCRIPTIONS[code]).toBeTruthy();
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN.permissions).toEqual(ALL_PERMISSIONS);
  });
});

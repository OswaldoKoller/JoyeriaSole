import { describe, expect, it } from 'vitest';
import { diffAudit, flattenAudit, formatAuditValue } from './audit-diff.ts';
import {
  EMPTY_FILTERS,
  countActiveFilters,
  filtersFromParams,
  filtersToParams,
  toQueryFilters,
} from './audit-filters.ts';
import { actionLabel, entityTypeLabel, fieldLabel, hasActionLabel } from './audit-labels.ts';

describe('diccionario de etiquetas', () => {
  it('traduce las acciones más comunes de cada área', () => {
    const expected: Record<string, string> = {
      'product.created': 'Producto creado',
      'variant.created': 'Variante creada',
      'variant.price_changed': 'Precio de venta cambiado',
      'price.approved': 'Cambio de precio aprobado',
      'inventory_adjustment.requested': 'Ajuste de inventario solicitado',
      'stock_entry.confirmed': 'Ingreso de mercadería confirmado',
      'inventory_count.approved': 'Conteo físico aprobado',
      'inventory.exchange': 'Cambio de pieza',
      'user.roles_updated': 'Roles del usuario modificados',
      'auth.login_failed': 'Intento de inicio de sesión fallido',
    };
    for (const [code, label] of Object.entries(expected)) {
      expect(actionLabel(code), code).toBe(label);
      expect(hasActionLabel(code), code).toBe(true);
    }
  });

  it('usa el código crudo cuando no hay etiqueta', () => {
    expect(actionLabel('algo.nuevo')).toBe('algo.nuevo');
    expect(hasActionLabel('algo.nuevo')).toBe(false);
    expect(entityTypeLabel('Desconocida')).toBe('Desconocida');
    expect(fieldLabel('campoRaro')).toBe('campoRaro');
  });

  it('traduce tipos de entidad y campos habituales', () => {
    expect(entityTypeLabel('ProductVariant')).toBe('Variante');
    expect(entityTypeLabel('InventoryAdjustment')).toBe('Ajuste de inventario');
    expect(fieldLabel('salePrice')).toBe('Precio de venta');
    expect(fieldLabel('minStock')).toBe('Stock mínimo');
  });
});

describe('diferencias antes/después', () => {
  it('marca los campos que cambian y los pone primero', () => {
    const rows = diffAudit(
      { name: 'Anillo', salePrice: '10.00' },
      { name: 'Anillo', salePrice: '12.00' },
    );
    expect(rows).toEqual([
      { field: 'salePrice', before: '10.00', after: '12.00', changed: true },
      { field: 'name', before: 'Anillo', after: 'Anillo', changed: false },
    ]);
  });

  it('una creación (sin antes) deja el lado «antes» sin valor y todo cambia', () => {
    const rows = diffAudit(null, { name: 'Collar', minStock: 2 });
    expect(rows.map((row) => [row.field, row.before, row.after, row.changed])).toEqual([
      ['name', undefined, 'Collar', true],
      ['minStock', undefined, 2, true],
    ]);
  });

  it('una eliminación (sin después) también marca los cambios', () => {
    const rows = diffAudit({ name: 'Collar' }, undefined);
    expect(rows).toEqual([{ field: 'name', before: 'Collar', after: undefined, changed: true }]);
  });

  it('aplana objetos anidados con la ruta del campo y compara arreglos completos', () => {
    const rows = diffAudit(
      { address: { city: 'La Paz', zone: 'Sur' }, roles: ['A'] },
      { address: { city: 'Sucre', zone: 'Sur' }, roles: ['A', 'B'] },
    );
    expect(rows.filter((row) => row.changed).map((row) => row.field)).toEqual([
      'address.city',
      'roles',
    ]);
    expect(rows.find((row) => row.field === 'address.zone')?.changed).toBe(false);
  });

  it('distingue null de ausente y no confunde 0, falso o texto vacío con «sin cambio»', () => {
    const rows = diffAudit({ a: null, b: 0, c: false }, { a: 0, b: 0, c: '' });
    expect(Object.fromEntries(rows.map((row) => [row.field, row.changed]))).toEqual({
      a: true,
      b: false,
      c: true,
    });
  });

  it('sin antes ni después no hay filas', () => {
    expect(diffAudit(null, null)).toEqual([]);
  });

  it('flattenAudit lista pares campo/valor', () => {
    expect(flattenAudit({ origin: 'REQUEST', ids: { batch: 'x' } })).toEqual([
      ['origin', 'REQUEST'],
      ['ids.batch', 'x'],
    ]);
    expect(flattenAudit(null)).toEqual([]);
  });

  it('formatea los valores para mostrarlos como texto', () => {
    expect(formatAuditValue(undefined)).toBe('—');
    expect(formatAuditValue(null)).toBe('vacío');
    expect(formatAuditValue(true)).toBe('Sí');
    expect(formatAuditValue(false)).toBe('No');
    expect(formatAuditValue('')).toBe('(texto vacío)');
    expect(formatAuditValue(5)).toBe('5');
    expect(formatAuditValue(['a', 1])).toBe('["a",1]');
    expect(formatAuditValue('<b>x</b>')).toBe('<b>x</b>');
  });
});

describe('filtros de la URL', () => {
  it('lee los filtros iniciales de la URL e ignora valores inválidos', () => {
    const params = new URLSearchParams(
      'entityType=Product&entityId=abc&from=2026-11-01&to=ayer&userId=no-uuid&q=%20precio%20',
    );
    expect(filtersFromParams(params)).toEqual({
      ...EMPTY_FILTERS,
      entityType: 'Product',
      entityId: 'abc',
      from: '2026-11-01',
      q: 'precio',
    });
  });

  it('acepta un userId UUID válido', () => {
    const userId = '01900000-0000-7000-8000-000000000001';
    expect(filtersFromParams(new URLSearchParams({ userId })).userId).toBe(userId);
  });

  it('serializa solo los filtros no vacíos y cuenta los activos', () => {
    const filters = { ...EMPTY_FILTERS, action: 'price.', q: 'x' };
    expect(filtersToParams(filters).toString()).toBe('action=price.&q=x');
    expect(countActiveFilters(filters)).toBe(2);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('convierte el rango de días a instantes de La Paz (día completo)', () => {
    const query = toQueryFilters({ ...EMPTY_FILTERS, from: '2026-11-01', to: '2026-11-02' });
    expect(query.from).toBe('2026-11-01T00:00:00.000-04:00');
    expect(query.to).toBe('2026-11-02T23:59:59.999-04:00');
    expect(toQueryFilters(EMPTY_FILTERS).from).toBe('');
  });
});

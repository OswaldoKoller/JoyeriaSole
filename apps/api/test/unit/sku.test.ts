import { describe, expect, it } from 'vitest';
import { skuCandidates } from '../../src/lib/sku.ts';

describe('skuCandidates', () => {
  it('prueba el código tal cual y en mayúsculas, sin comodines ni duplicados', () => {
    expect(skuCandidates('sku-000012')).toEqual(['sku-000012', 'SKU-000012']);
    expect(skuCandidates('SKU-000012')).toEqual(['SKU-000012']);
    expect(skuCandidates('  sku-000012 ')).toEqual(['sku-000012', 'SKU-000012']);
  });
});

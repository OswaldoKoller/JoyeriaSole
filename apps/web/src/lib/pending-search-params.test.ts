import { describe, expect, it } from 'vitest';
import { PendingSearchParams } from './pending-search-params.ts';

const params = (text: string) => new URLSearchParams(text);

describe('PendingSearchParams', () => {
  it('sin cambios pendientes parte de la última URL renderizada', () => {
    const pending = new PendingSearchParams();
    pending.observe(params('q=anillo'), 'k1');
    expect(pending.base().toString()).toBe('q=anillo');
  });

  it('un render con la URL anterior no borra un cambio pedido y aún no aplicado', () => {
    const pending = new PendingSearchParams();
    pending.observe(params('q=ABC'), 'k1');
    pending.push(params('')); // se pidió quitar la búsqueda
    pending.observe(params('q=ABC'), 'k1'); // render urgente previo a la transición
    expect(pending.base().toString()).toBe('');
  });

  it('varios cambios seguidos se componen aunque la URL tarde en aplicarse', () => {
    const pending = new PendingSearchParams();
    pending.observe(params('q=ABC'), 'k1');
    const first = pending.base();
    first.delete('q');
    pending.push(first);
    const second = pending.base();
    second.set('incomplete', '1');
    pending.push(second);
    expect(second.toString()).toBe('incomplete=1');
    pending.observe(params('q=ABC'), 'k1');
    expect(pending.base().toString()).toBe('incomplete=1');
  });

  it('al aplicarse un cambio intermedio se conservan los posteriores', () => {
    const pending = new PendingSearchParams();
    pending.observe(params(''), 'k1');
    pending.push(params('a=1'));
    pending.push(params('a=1&b=2'));
    pending.observe(params('a=1'), 'k2');
    expect(pending.base().toString()).toBe('a=1&b=2');
    pending.observe(params('a=1&b=2'), 'k3');
    expect(pending.base().toString()).toBe('a=1&b=2');
  });

  it('una navegación externa (botón Atrás) descarta los cambios pendientes', () => {
    const pending = new PendingSearchParams();
    pending.observe(params('q=ABC'), 'k1');
    pending.push(params('q=ABC&incomplete=1'));
    pending.observe(params('categoryId=7'), 'k2'); // ninguna coincidencia y cambió la ubicación
    expect(pending.base().toString()).toBe('categoryId=7');
  });

  it('el estado inicial se toma de los parámetros de arranque', () => {
    const pending = new PendingSearchParams(params('q=luna&page=2'));
    expect(pending.base().toString()).toBe('q=luna&page=2');
  });
});

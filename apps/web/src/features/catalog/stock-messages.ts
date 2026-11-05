/** P-22: con stock no se desactiva. Texto que acompaña al botón deshabilitado. */
export function stockBlockMessage(subject: 'el producto' | 'la variante', pieces: number) {
  return `No se puede desactivar ${subject}: tiene ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'} en stock. Registre primero un ajuste de salida hasta dejarlo en cero.`;
}

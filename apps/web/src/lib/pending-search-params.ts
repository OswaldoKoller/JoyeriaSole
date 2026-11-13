/**
 * Parámetros de URL «vigentes» para componer cambios seguidos.
 *
 * React Router aplica `setSearchParams` de forma diferida (transición de React): entre la llamada y
 * el render con la URL nueva puede haber renders urgentes con la URL anterior, y un manejador que se
 * ejecute en ese lapso leería parámetros viejos y borraría el cambio recién pedido. Esta clase
 * recuerda los cambios solicitados que la URL renderizada todavía no refleja, de modo que el
 * siguiente cambio parta siempre del último pedido y no del último render.
 *
 * Uso: `observe` tras cada render (efecto), `base` + `push` al cambiar parámetros.
 */
export class PendingSearchParams {
  private rendered = new URLSearchParams();
  private renderedKey = '';
  /** Cambios pedidos y aún no renderizados, del más antiguo al más reciente. */
  private targets: string[] = [];

  constructor(initial?: URLSearchParams) {
    if (initial) this.rendered = new URLSearchParams(initial);
  }

  /** Parámetros sobre los que se compone el siguiente cambio (copia modificable). */
  base(): URLSearchParams {
    return new URLSearchParams(this.targets.at(-1) ?? this.rendered);
  }

  /** Registra un cambio ya enviado a `setSearchParams`. */
  push(next: URLSearchParams): void {
    this.targets.push(next.toString());
  }

  /**
   * Informa la URL que React Router ya aplicó (`key` es la clave de la ubicación).
   * - Si coincide con un cambio pedido, ese y los anteriores quedan resueltos.
   * - Si la ubicación cambió y no coincide con ninguno (botón Atrás, enlace), fue una navegación
   *   externa: los cambios pendientes se descartan.
   * - Un render con la misma ubicación y la URL anterior (urgente, previo a la transición) no
   *   descarta nada.
   */
  observe(rendered: URLSearchParams, key: string): void {
    const text = rendered.toString();
    const matched = this.targets.lastIndexOf(text);
    if (matched >= 0) this.targets.splice(0, matched + 1);
    else if (key !== this.renderedKey) this.targets = [];
    this.rendered = new URLSearchParams(rendered);
    this.renderedKey = key;
  }
}

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CODE128_QUIET_MODULES, barRuns, encodeCode128 } from './code128.ts';
import { labelPrintCss, type LabelSize } from './label-settings.ts';

/** Medidas del dibujo en «módulos» (el ancho de la barra más fina). */
const BAR_HEIGHT = 40;
const TEXT_GAP = 3;
const TEXT_SIZE = 14;
const VIEW_HEIGHT = BAR_HEIGHT + TEXT_GAP + TEXT_SIZE + 2;

/**
 * Etiqueta propia (Q-10 A, B7): únicamente el Code 128 del SKU y el SKU legible. Nada más: ni
 * precio ni nombre. El dibujo es un SVG vectorial que escala al tamaño de la etiqueta.
 */
export function LabelBarcode({ sku }: { sku: string }) {
  const code = useMemo(() => {
    try {
      return encodeCode128(sku);
    } catch {
      return null;
    }
  }, [sku]);

  if (!code) {
    return (
      <p role="alert" className="text-xs text-red-700">
        No se puede codificar «{sku}».
      </p>
    );
  }
  const path = barRuns(code.pattern)
    .map((run) => `M${run.x + CODE128_QUIET_MODULES} 0h${run.width}v${BAR_HEIGHT}h-${run.width}z`)
    .join('');
  return (
    <svg
      role="img"
      aria-label={`Código de barras Code 128 del SKU ${sku}`}
      viewBox={`0 0 ${code.totalModules} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      shapeRendering="crispEdges"
    >
      <rect width={code.totalModules} height={VIEW_HEIGHT} fill="#fff" />
      <path d={path} fill="#000" />
      <text
        x={code.totalModules / 2}
        y={BAR_HEIGHT + TEXT_GAP + TEXT_SIZE - 2}
        textAnchor="middle"
        fontFamily="ui-monospace, Menlo, Consolas, monospace"
        fontSize={TEXT_SIZE}
        fill="#000"
      >
        {sku}
      </text>
    </svg>
  );
}

/** Una etiqueta del tamaño configurado (una página al imprimir). */
export function LabelPage({ sku, size }: { sku: string; size: LabelSize }) {
  return (
    <div
      className="label-page"
      data-sku={sku}
      style={{
        width: `${size.widthMm}mm`,
        height: `${size.heightMm}mm`,
        padding: '1.5mm',
        boxSizing: 'border-box',
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <LabelBarcode sku={sku} />
    </div>
  );
}

/**
 * Contenido que se envía a la impresora: va en un portal hijo de `<body>` (fuera de `#root`) para
 * que `@media print` oculte toda la aplicación y quede una etiqueta por página con `@page`.
 */
export function LabelPrintArea({ skus, size }: { skus: string[]; size: LabelSize }) {
  return createPortal(
    <div id="print-labels" aria-hidden="true">
      <style>{labelPrintCss(size)}</style>
      {skus.map((sku, index) => (
        <LabelPage key={`${sku}-${index}`} sku={sku} size={size} />
      ))}
    </div>,
    document.body,
  );
}

import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';
import { Button } from '../../components/ui/button.tsx';

export function BarcodePreview({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: 'CODE128',
      width: 2,
      height: 68,
      margin: 8,
      displayValue: true,
    });
  }, [value]);

  function download() {
    if (!ref.current) return;
    const xml = new XMLSerializer().serializeToString(ref.current);
    const href = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = `${value}.svg`;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(href);
    }, 0);
  }

  return (
    <div className="space-y-2 overflow-x-auto rounded-lg bg-white p-2">
      <svg ref={ref} role="img" aria-label={`Código de barras ${value}`} />
      <Button variant="secondary" onClick={download}>
        Descargar etiqueta SVG
      </Button>
    </div>
  );
}

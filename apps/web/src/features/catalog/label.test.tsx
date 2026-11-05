import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelPage, LabelPrintArea } from './label.tsx';

const size = { widthMm: 50, heightMm: 25 };

describe('etiqueta', () => {
  it('lleva solo el Code 128 del SKU y el SKU legible', () => {
    const { container } = render(<LabelPage sku="SKU-000012" size={size} />);
    const svg = screen.getByRole('img', { name: 'Código de barras Code 128 del SKU SKU-000012' });
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg.querySelector('text')?.textContent).toBe('SKU-000012');
    // Nada más: ni precio ni nombre.
    expect(container.textContent).toBe('SKU-000012');
    const page = container.querySelector<HTMLElement>('.label-page');
    expect(page?.style.width).toBe('50mm');
    expect(page?.style.height).toBe('25mm');
  });

  it('avisa si el código no se puede codificar', () => {
    render(<LabelPage sku="SKU-ñ" size={size} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se puede codificar');
  });

  it('el área de impresión va fuera de #root, con una página por etiqueta y @page', () => {
    render(<LabelPrintArea skus={['SKU-000001', 'SKU-000001', 'SKU-000002']} size={size} />);
    const area = document.getElementById('print-labels');
    expect(area?.parentElement).toBe(document.body);
    expect(area?.querySelectorAll('.label-page')).toHaveLength(3);
    expect(area?.querySelectorAll('svg')).toHaveLength(3);
    expect(area?.querySelector('style')?.textContent).toContain(
      '@page { size: 50mm 25mm; margin: 0; }',
    );
  });
});

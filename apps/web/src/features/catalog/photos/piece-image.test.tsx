import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PieceImage } from './piece-image.tsx';

const VARIANT_ID = '00000000-0000-7000-8000-000000000042';

describe('PieceImage', () => {
  it('pide la portada de la pieza por su variante y es decorativa (el nombre va como texto)', () => {
    const { container } = render(<PieceImage variantId={VARIANT_ID} className="size-20" />);
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', `/api/v1/products/variants/${VARIANT_ID}/cover`);
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveClass('size-20');
  });

  it('sin variante muestra un marcador y no pide ninguna imagen', () => {
    const { container } = render(<PieceImage variantId={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

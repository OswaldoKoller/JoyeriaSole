import type { Product, ProductPhoto } from '@joyeria/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render.tsx';
import { isSafePhotoUrl } from './photo-url.ts';
import { ProductThumb } from './product-thumb.tsx';

function photoWith(url: string): ProductPhoto {
  return {
    id: '00000000-0000-7000-8000-000000000101',
    url,
    contentType: 'image/webp',
    width: 800,
    height: 600,
    sizeBytes: 1000,
    position: 0,
    isCover: true,
  };
}

describe('URL de las fotos (S-01)', () => {
  it('solo acepta rutas de nuestra API', () => {
    expect(isSafePhotoUrl('/api/v1/products/1/photos/2')).toBe(true);
    for (const url of [
      'https://evil.test/foto.png',
      '//evil.test/foto.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '/otra/ruta.png',
      '',
    ]) {
      expect(isSafePhotoUrl(url)).toBe(false);
    }
  });

  it('una foto con URL externa no se carga: se muestra el marcador «Sin foto»', () => {
    const product = {
      name: 'Anillo',
      photos: [photoWith('https://evil.test/foto.png')],
    } as Pick<Product, 'name' | 'photos'>;
    renderWithProviders(<ProductThumb product={product} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Sin foto')).toBeInTheDocument();
  });
});

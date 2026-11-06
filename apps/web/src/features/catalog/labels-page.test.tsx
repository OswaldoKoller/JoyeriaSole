import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { LABEL_SIZE_STORAGE_KEY } from './label-settings.ts';
import { LabelsPage } from './labels-page.tsx';

const found = (sku: string, name = 'Anillo corazón') => ({
  variantId: '00000000-0000-7000-8000-000000000001',
  productId: '00000000-0000-7000-8000-000000000002',
  productName: name,
  categoryName: 'Anillos',
  label: 'Plata 925 / 16',
  sku,
  barcode: null,
  salePrice: '120',
  status: 'ACTIVE',
  productStatus: 'ACTIVE',
  matchedBy: 'SKU',
});

function mockApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes('/catalog/variants/lookup')) {
      const code = decodeURIComponent(/code=([^&]+)/.exec(url)?.[1] ?? '');
      return Promise.resolve(
        code.startsWith('SKU-')
          ? jsonResponse(200, { data: found(code) })
          : jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No existe una pieza' } }),
      );
    }
    if (url.includes('/products?')) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [
            {
              id: 'p1',
              name: 'Cadena cubana',
              variants: [{ sku: 'SKU-000050', label: '45 cm' }],
            },
          ],
          meta: { page: 1, pageSize: 10, total: 1 },
        }),
      );
    }
    return Promise.resolve(jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x' } }));
  });
}

afterEach(() => {
  window.localStorage.clear();
});

describe('pantalla de etiquetas', () => {
  it('agrega una pieza al teclear (o escanear) el SKU y pulsar Enter, y calcula las etiquetas', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<LabelsPage />);

    await user.type(
      screen.getByLabelText('Escanee o escriba un SKU, código o nombre'),
      'SKU-000012{Enter}',
    );
    const row = (await screen.findByText('SKU-000012', { selector: 'td' })).closest('tr');
    expect(row).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Imprimir 1 etiqueta' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Copias de SKU-000012'), { target: { value: '3' } });
    expect(screen.getByRole('button', { name: 'Imprimir 3 etiquetas' })).toBeInTheDocument();

    // Vista previa (1 pieza) + área de impresión (3 copias), solo SVG del SKU.
    const printArea = document.getElementById('print-labels');
    expect(printArea?.querySelectorAll('.label-page')).toHaveLength(3);
    expect(
      within(screen.getByLabelText('Vista previa de etiquetas')).getAllByRole('img'),
    ).toHaveLength(1);
  });

  it('si el texto no es un código exacto ofrece una lista para elegir', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<LabelsPage />);
    await user.type(
      screen.getByLabelText('Escanee o escriba un SKU, código o nombre'),
      'cadena{Enter}',
    );
    await user.click(await screen.findByRole('button', { name: 'Agregar etiqueta de SKU-000050' }));
    expect(await screen.findByText('SKU-000050', { selector: 'td' })).toBeInTheDocument();
  });

  it('precarga las piezas de ?codes= (desde la ficha del producto)', async () => {
    mockApi();
    renderWithProviders(<LabelsPage />, {
      route: '/catalogo/etiquetas?codes=SKU-000001,SKU-000002',
    });
    expect(await screen.findByText('SKU-000001', { selector: 'td' })).toBeInTheDocument();
    expect(await screen.findByText('SKU-000002', { selector: 'td' })).toBeInTheDocument();
  });

  it('el tamaño es configurable, se valida y se guarda en el navegador', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<LabelsPage />);
    expect(screen.getByLabelText('Ancho (mm)')).toHaveValue('50');
    expect(screen.getByLabelText('Alto (mm)')).toHaveValue('25');

    await user.clear(screen.getByLabelText('Ancho (mm)'));
    await user.type(screen.getByLabelText('Ancho (mm)'), '60');
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(LABEL_SIZE_STORAGE_KEY) ?? '{}')).toEqual({
        widthMm: 60,
        heightMm: 25,
      });
    });

    await user.clear(screen.getByLabelText('Alto (mm)'));
    await user.type(screen.getByLabelText('Alto (mm)'), '2');
    expect(await screen.findByRole('alert')).toHaveTextContent('Use un ancho');
  });

  it('imprime con window.print', async () => {
    mockApi();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithProviders(<LabelsPage />, { route: '/catalogo/etiquetas?codes=SKU-000001' });
    await user.click(await screen.findByRole('button', { name: 'Imprimir 1 etiqueta' }));
    expect(print).toHaveBeenCalledOnce();
  });
});

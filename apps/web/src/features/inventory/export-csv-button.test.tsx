import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi } from '../../test/api-mock.ts';
import { mockBlobUrls } from '../../test/blob-urls.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { ExportCsvButton } from './export-csv-button.tsx';

const PATH = '/inventory/export.csv';
const csvResponse = () =>
  new Response('\uFEFFSKU;Saldo\r\nSKU-1;5\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inventario-2026-11-13.csv"',
    },
  });

describe('Botón «Exportar CSV»', () => {
  let blobUrls: ReturnType<typeof mockBlobUrls>;
  let downloads: { name: string; href: string }[];

  beforeEach(() => {
    blobUrls = mockBlobUrls();
    downloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ name: this.download, href: this.href });
    });
  });
  afterEach(() => {
    blobUrls.restore();
  });

  it('descarga con el nombre que propone el servidor, usando la ruta recibida', async () => {
    const calls = mockApi({ [`GET ${PATH}`]: () => csvResponse() }, { permissions: [] });
    renderWithProviders(
      <ExportCsvButton path={`${PATH}?q=anillo&level=OK`} subject="el inventario" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => {
      expect(downloads).toEqual([
        { name: 'inventario-2026-11-13.csv', href: 'blob:csv-de-prueba' },
      ]);
    });
    expect(calls.map((call) => call.path)).toEqual([`${PATH}?q=anillo&level=OK`]);
    // El contenido llega intacto, con el BOM UTF-8 (EF BB BF) que Excel necesita.
    const bytes = new Uint8Array((await blobUrls.blobs[0]?.arrayBuffer()) ?? new ArrayBuffer(0));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('SKU;Saldo\r\nSKU-1;5\r\n');
    expect(blobUrls.revoked).toEqual(['blob:csv-de-prueba']);
    expect(await screen.findByText('Archivo descargado.')).toBeInTheDocument();
    // No quedan enlaces temporales en el documento.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('se deshabilita y anuncia que prepara el archivo mientras espera', async () => {
    let finish: (response: Response) => void = () => undefined;
    mockApi(
      {
        [`GET ${PATH}`]: () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      },
      { permissions: [] },
    );
    renderWithProviders(<ExportCsvButton path={PATH} subject="el inventario" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    const busy = await screen.findByRole('button', { name: 'Preparando archivo…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    finish(csvResponse());
    expect(await screen.findByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  });

  it('muestra el error de la API (p. ej. el tope de filas) y permite reintentar', async () => {
    mockApi(
      {
        [`GET ${PATH}`]: () => [
          422,
          apiError('BUSINESS_RULE_VIOLATION', 'La exportación supera el máximo de 50000 filas.'),
        ],
      },
      { permissions: [] },
    );
    renderWithProviders(<ExportCsvButton path={PATH} subject="los movimientos" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo exportar los movimientos');
    expect(alert).toHaveTextContent('supera el máximo de 50000 filas');
    expect(downloads).toEqual([]);
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  });

  it('muestra el aviso (hint) bajo el botón', () => {
    renderWithProviders(<ExportCsvButton path={PATH} subject="x" hint="Incluye costos." />);
    expect(screen.getByText('Incluye costos.')).toBeInTheDocument();
  });
});

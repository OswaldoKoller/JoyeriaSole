import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi } from '../../test/api-mock.ts';
import { renderWithProviders } from '../../test/render.tsx';
import { saleDetail, saleReceipt } from '../../test/sales-fixtures.ts';
import { RECEIPT_FORMAT_STORAGE_KEY } from './receipt-settings.ts';
import { ReceiptPage } from './receipt-page.tsx';

const SALE_ID = saleDetail().id;
const PRINT = `POST /sales/${SALE_ID}/receipt/print-events`;

function renderReceipt(routes: Parameters<typeof mockApi>[0]) {
  const calls = mockApi(
    { [`GET /sales/${SALE_ID}/receipt`]: () => [200, { data: saleReceipt() }], ...routes },
    { permissions: ['sales:read'] },
  );
  renderWithProviders(
    <Routes>
      <Route path="/ventas/:id/comprobante" element={<ReceiptPage />} />
    </Routes>,
    { route: `/ventas/${SALE_ID}/comprobante` },
  );
  return calls;
}

function printArea() {
  const area = document.getElementById('print-receipt');
  if (!area) throw new Error('Falta #print-receipt');
  return area;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('comprobante interno', () => {
  it('muestra las leyendas obligatorias, A4 por defecto y nunca costos ni referencias', async () => {
    renderReceipt({});
    const preview = await screen.findByRole('article', {
      name: 'Comprobante de la venta VTA-000123',
    });
    expect(preview).toHaveTextContent('Comprobante interno');
    expect(preview).toHaveTextContent('No válido como factura fiscal');
    expect(preview).toHaveTextContent('Joyería Sole');
    expect(preview).toHaveTextContent(/Vuelto.*49,50/);
    expect(preview).not.toHaveTextContent('OP-1');
    expect(preview).not.toHaveTextContent(/costo/i);
    expect(preview).not.toHaveTextContent('COPIA');
    expect(screen.getByRole('radio', { name: 'Hoja A4' })).toBeChecked();
    expect(preview).toHaveAttribute('data-format', 'A4');
    // El portal de impresión vive fuera de #root, con el @page del formato.
    expect(printArea().parentElement).toBe(document.body);
    expect(printArea().querySelector('style')?.textContent).toContain(
      '@page { size: A4; margin: 15mm; }',
    );
  });

  it('recuerda el formato y ajusta la vista previa y el @page', async () => {
    renderReceipt({});
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Rollo de 58 mm' }));
    expect(window.localStorage.getItem(RECEIPT_FORMAT_STORAGE_KEY)).toBe('58mm');
    expect(screen.getByRole('article', { name: /Comprobante de la venta/ })).toHaveAttribute(
      'data-format',
      '58mm',
    );
    expect(printArea().querySelector('style')?.textContent).toContain(
      '@page { size: 58mm auto; margin: 0; }',
    );
  });

  it('usa el formato recordado al volver', async () => {
    window.localStorage.setItem(RECEIPT_FORMAT_STORAGE_KEY, 'A5');
    renderReceipt({});
    expect(await screen.findByRole('radio', { name: 'Hoja A5' })).toBeChecked();
  });

  it('registra la impresión ANTES de imprimir y marca «COPIA» desde la segunda', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    let count = 0;
    const calls = renderReceipt({
      [`GET /sales/${SALE_ID}/receipt`]: () => [200, { data: saleReceipt({ printCount: count }) }],
      [PRINT]: () => {
        count += 1;
        return [
          201,
          { data: { copyNumber: count, isCopy: count > 1, printedAt: '2026-11-11T16:00:00.000Z' } },
        ];
      },
    });
    const user = userEvent.setup();
    const button = await screen.findByRole('button', {
      name: 'Imprimir comprobante de la venta VTA-000123',
    });
    await user.click(button);
    expect(await screen.findByText('Impresión del original registrada.')).toBeVisible();
    expect(print).toHaveBeenCalledTimes(1);
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ format: 'A4' });
    expect(within(printArea()).queryByText('COPIA')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Imprimir comprobante/ }));
    expect(await screen.findByText('Impresión registrada como copia n.º 2.')).toBeVisible();
    expect(print).toHaveBeenCalledTimes(2);
    expect(within(printArea()).getByText('COPIA')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /Comprobante de la venta/ })).toHaveTextContent(
      'COPIA',
    );
    // Imprimir nunca crea ni modifica ventas.
    expect(calls.some((call) => call.path === '/sales' && call.method === 'POST')).toBe(false);
  });

  it('si no se pudo registrar la impresión, no imprime', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderReceipt({ [PRINT]: () => [404, apiError('NOT_FOUND', 'Venta no encontrada')] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Imprimir comprobante/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se imprimió');
    expect(print).not.toHaveBeenCalled();
  });

  it('un comprobante ya impreso anticipa que la próxima será copia', async () => {
    renderReceipt({
      [`GET /sales/${SALE_ID}/receipt`]: () => [200, { data: saleReceipt({ printCount: 1 }) }],
    });
    expect(await screen.findByText(/la próxima impresión saldrá con la marca/)).toBeVisible();
    expect(screen.getByRole('article', { name: /Comprobante de la venta/ })).toHaveTextContent(
      'COPIA',
    );
  });
});

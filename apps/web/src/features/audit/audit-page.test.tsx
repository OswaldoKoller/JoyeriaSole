import type { AuditDetail, AuditEntry, AuditFilters } from '@joyeria/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { AuditPage } from './audit-page.tsx';

const USER = {
  id: '01900000-0000-7000-8000-000000000001',
  name: 'Ana Admin',
  email: 'ana@test.local',
};

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: '41',
  createdAt: '2026-11-05T14:30:00.000Z',
  action: 'variant.price_changed',
  entityType: 'ProductVariant',
  entityId: 'abc',
  user: USER,
  ip: '10.0.0.1',
  requestId: 'req-1',
  before: { salePrice: '10.00', name: 'Anillo' },
  after: { salePrice: '12.00', name: 'Anillo' },
  metadata: { origin: 'REQUEST' },
  ...overrides,
});

const detailOf = (overrides: Partial<AuditDetail> = {}): AuditDetail => ({
  ...entry(),
  userAgent: 'Mozilla/5.0 Test',
  ...overrides,
});

const filters: AuditFilters = {
  actions: ['variant.price_changed', 'algo.nuevo'],
  entityTypes: ['ProductVariant'],
  users: [USER],
};

/** Responde cada ruta de la API; devuelve las URL pedidas para inspeccionarlas. */
function mockApi(rows: AuditEntry[], detail: AuditDetail | null = null) {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    urls.push(url);
    if (url.includes('/audit/actions')) {
      return Promise.resolve(jsonResponse(200, { data: filters }));
    }
    if (/\/audit\/\d+$/.test(url) && detail) {
      return Promise.resolve(jsonResponse(200, { data: detail }));
    }
    if (url.includes('/audit?')) {
      return Promise.resolve(
        jsonResponse(200, { data: rows, meta: { page: 1, pageSize: 25, total: rows.length } }),
      );
    }
    throw new Error(`Petición inesperada: ${url}`);
  });
  return urls;
}

const lastListQuery = (urls: string[]) => {
  const last = urls.filter((url) => url.includes('/audit?')).at(-1) ?? '';
  return new URL(last, 'http://x').searchParams;
};

function renderPage(route = '/auditoria') {
  renderWithProviders(
    <Routes>
      <Route path="/auditoria" element={<AuditPage />} />
    </Routes>,
    { route },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pantalla de auditoría', () => {
  it('lista los registros con acción en español, usuario y fecha de La Paz', async () => {
    mockApi([
      entry(),
      entry({ id: '40', user: null, action: 'algo.nuevo', entityType: null, entityId: null }),
    ]);
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Precio de venta cambiado')).toBeInTheDocument();
    expect(within(table).getByText('Ana Admin')).toBeInTheDocument();
    // 14:30 UTC = 10:30 en La Paz
    expect(within(table).getAllByText(/10:30:00/).length).toBeGreaterThan(0);
    // Acción sin etiqueta: se muestra el código crudo; sin usuario: «Sistema».
    expect(within(table).getByText('algo.nuevo')).toBeInTheDocument();
    expect(within(table).getByText('Sistema')).toBeInTheDocument();
    expect(await screen.findByText('2 registros')).toBeInTheDocument();
  });

  it('usa la tabla en modo tarjetas para móvil y botones de detalle accesibles', async () => {
    mockApi([entry()]);
    renderPage();
    const table = await screen.findByRole('table');
    expect(table).toHaveClass('table-cards');
    expect(
      within(table).getByRole('button', { name: /Ver detalle: Precio de venta cambiado/ }),
    ).toBeInTheDocument();
  });

  it('toma los filtros iniciales de la URL y los envía a la API', async () => {
    const urls = mockApi([entry()]);
    renderPage('/auditoria?entityType=ProductVariant&entityId=abc&from=2026-11-01');

    await screen.findByRole('table');
    const query = lastListQuery(urls);
    expect(query.get('entityType')).toBe('ProductVariant');
    expect(query.get('entityId')).toBe('abc');
    expect(query.get('from')).toBe('2026-11-01T00:00:00.000-04:00');
    expect(screen.getByLabelText('ID de la entidad')).toHaveValue('abc');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-01');
    expect(await screen.findByText(/con 3 filtros/)).toBeInTheDocument();
  });

  it('aplicar y limpiar filtros vuelve a consultar con los nuevos valores', async () => {
    const urls = mockApi([entry()]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await screen.findByRole('option', { name: 'Precio de venta cambiado' });

    await user.selectOptions(screen.getByLabelText('Acción'), 'variant.price_changed');
    await user.type(screen.getByLabelText(/^Buscar/), 'anillo');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => {
      const query = lastListQuery(urls);
      expect(query.get('action')).toBe('variant.price_changed');
      expect(query.get('q')).toBe('anillo');
    });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => {
      expect(lastListQuery(urls).get('action')).toBeNull();
    });
    expect(screen.getByLabelText('Acción')).toHaveValue('');
  });

  it('impide aplicar un rango de fechas invertido', async () => {
    mockApi([entry()]);
    const user = userEvent.setup();
    renderPage('/auditoria?from=2026-11-05&to=2026-11-05');
    await screen.findByRole('table');
    await user.clear(screen.getByLabelText('Hasta'));
    await user.type(screen.getByLabelText('Hasta'), '2026-11-01');
    expect(await screen.findByText(/no puede ser anterior/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar filtros' })).toBeDisabled();
  });

  it('muestra el estado vacío sin filtros', async () => {
    mockApi([]);
    renderPage();
    expect(await screen.findByText('Todavía no hay registros de auditoría.')).toBeInTheDocument();
  });

  it('muestra el estado vacío con filtros activos', async () => {
    mockApi([]);
    renderPage('/auditoria?entityId=zzz');
    expect(
      await screen.findByText('No hay registros que coincidan con los filtros.'),
    ).toBeInTheDocument();
  });

  it('muestra un error con opción de reintentar', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/audit/actions')) {
        return Promise.resolve(jsonResponse(200, { data: filters }));
      }
      return Promise.resolve(
        jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'Error' } }),
      );
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la auditoría');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el detalle muestra el antes/después resaltando lo que cambia y el JSON escapado', async () => {
    const note = '<img src=x onerror=alert(1)>';
    mockApi(
      [entry()],
      detailOf({
        before: { salePrice: '10.00', name: 'Anillo', note },
        after: { salePrice: '12.00', name: 'Anillo', note },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Ver detalle/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Detalle del registro' });
    expect(await within(dialog).findByText('Mozilla/5.0 Test')).toBeInTheDocument();
    expect(within(dialog).getByText('req-1')).toBeInTheDocument();
    expect(within(dialog).getByText('10.0.0.1')).toBeInTheDocument();

    const diff = within(dialog).getByRole('table', { name: /Diferencias/ });
    const priceRow = within(diff).getByRole('row', { name: /Precio de venta/ });
    expect(priceRow).toHaveAttribute('data-changed', 'true');
    expect(within(priceRow).getByText('10.00')).toBeInTheDocument();
    expect(within(priceRow).getByText('12.00')).toBeInTheDocument();
    expect(within(diff).getByRole('row', { name: /Nombre/ })).toHaveAttribute(
      'data-changed',
      'false',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Ver JSON completo' }));
    const json = within(dialog).getByLabelText('JSON completo del registro');
    expect(json.tagName).toBe('PRE');
    expect(json.textContent).toContain('"salePrice": "12.00"');
    // El texto potencialmente peligroso se muestra como texto, nunca como HTML.
    expect(dialog.querySelector('img')).toBeNull();
    expect(json.textContent).toContain(note);

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('un registro sin valores guardados lo indica', async () => {
    const empty = { before: null, after: null, metadata: null };
    mockApi([entry(empty)], detailOf({ ...empty, userAgent: null }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Ver detalle/ }));
    expect(await screen.findByText(/no guardó valores anteriores ni nuevos/)).toBeInTheDocument();
  });
});

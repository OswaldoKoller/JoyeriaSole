import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDocumentTitle } from '../lib/use-document-title.ts';
import { jsonResponse, renderWithProviders } from '../test/render.tsx';
import { AppShell } from './app-shell.tsx';

function mockUser(permissions: string[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      jsonResponse(200, {
        data: { id: 'u', name: 'Ana', email: 'ana@test.local', roles: [], permissions },
      }),
    ),
  );
}

function Home() {
  useDocumentTitle('Inicio');
  return <h1>Inicio</h1>;
}

function Products() {
  useDocumentTitle('Productos');
  return <h1>Productos</h1>;
}

/** Pantalla que enfoca su propio campo al montarse (como la captura con lector de códigos). */
function Scanner() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return <input ref={input} aria-label="Código" />;
}

function renderApp(permissions: string[]) {
  mockUser(permissions);
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="productos" element={<Products />} />
        <Route path="inventario" element={<Scanner />} />
      </Route>
    </Routes>,
  );
}

describe('cambio de pantalla', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el foco pasa al contenido y el título de la pestaña cambia', async () => {
    renderApp(['catalog:read']);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(document.title).toBe('Inicio · Joyería Sole');
    // Al cargar la primera vez no se roba el foco.
    expect(document.body).toHaveFocus();

    await userEvent.click(await within(nav).findByRole('link', { name: 'Productos' }));

    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeVisible();
    expect(document.title).toBe('Productos · Joyería Sole');
    expect(document.getElementById('contenido')).toHaveFocus();
  });

  it('no quita el foco a una pantalla que ya enfocó su propio campo', async () => {
    renderApp(['inventory:read']);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await userEvent.click(await within(nav).findByRole('link', { name: 'Saldos y alertas' }));
    expect(await screen.findByLabelText('Código')).toHaveFocus();
  });
});

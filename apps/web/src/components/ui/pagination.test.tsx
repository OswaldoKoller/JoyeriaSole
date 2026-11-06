import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './pagination.tsx';

function Harness({ total = 60, initial = 1 }: { total?: number; initial?: number }) {
  const [page, setPage] = useState(initial);
  return <Pagination page={page} total={total} noun="productos" onPageChange={setPage} />;
}

describe('Pagination', () => {
  it('no se muestra si todo cabe en una página', () => {
    const { container } = render(
      <Pagination page={1} total={25} noun="productos" onPageChange={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('es una navegación con nombre y un resumen que se anuncia (aria-live)', () => {
    render(<Harness />);
    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    const summary = screen.getByText('Página 1 de 3 · 60 productos');
    expect(nav).toContainElement(summary);
    expect(summary).toHaveAttribute('aria-live', 'polite');
  });

  it('los botones siguen montados y solo se deshabilitan en los extremos', async () => {
    render(<Harness total={60} />);
    const previous = screen.getByRole('button', { name: 'Anterior' });
    const next = screen.getByRole('button', { name: 'Siguiente' });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBe(previous);
    expect(previous).toBeEnabled();
    await userEvent.click(next);
    expect(next).toBeDisabled();
  });

  it('llama a onPageChange con la página destino', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} total={60} noun="usuarios" onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(onPageChange.mock.calls).toEqual([[3], [1]]);
  });

  it('el foco no se pierde al llegar a un extremo: pasa al botón opuesto', async () => {
    render(<Harness total={60} initial={2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveFocus();
  });

  it('respeta un tamaño de página distinto', () => {
    render(
      <Pagination
        page={1}
        total={25}
        pageSize={10}
        noun="cambios"
        onPageChange={() => undefined}
      />,
    );
    expect(screen.getByText('Página 1 de 3 · 25 cambios')).toBeInTheDocument();
  });
});

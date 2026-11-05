import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductBadges } from './product-badges.tsx';

const base = { status: 'ACTIVE' as const, isIncomplete: false, hasMissingPrice: false };

describe('insignias de la ficha (C1, D9)', () => {
  it('no muestra nada en una ficha completa y con precio', () => {
    const { container } = render(<ProductBadges product={base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra «Ficha incompleta» y «Sin precio» de forma independiente', () => {
    const { rerender } = render(<ProductBadges product={{ ...base, isIncomplete: true }} />);
    expect(screen.getByText('Ficha incompleta')).toBeInTheDocument();
    expect(screen.queryByText('Sin precio')).not.toBeInTheDocument();

    rerender(<ProductBadges product={{ ...base, hasMissingPrice: true }} />);
    expect(screen.queryByText('Ficha incompleta')).not.toBeInTheDocument();
    expect(screen.getByText('Sin precio')).toBeInTheDocument();

    rerender(<ProductBadges product={{ ...base, isIncomplete: true, hasMissingPrice: true }} />);
    expect(screen.getByText('Ficha incompleta')).toBeInTheDocument();
    expect(screen.getByText('Sin precio')).toBeInTheDocument();
  });

  it('un producto inactivo solo muestra su estado', () => {
    render(
      <ProductBadges product={{ status: 'INACTIVE', isIncomplete: true, hasMissingPrice: true }} />,
    );
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.queryByText('Ficha incompleta')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin precio')).not.toBeInTheDocument();
  });
});

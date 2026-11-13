import type { StockEntryCostType } from '@joyeria/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { costsFromServer, costsToInput } from './cost-lines.ts';
import { CostPanel } from './cost-panel.tsx';
import { StockEntryCosts } from './stock-entry-costs.tsx';

const TYPE_ID = '01900000-0000-7000-8000-0000000000f1';
const TYPES: StockEntryCostType[] = [
  { id: TYPE_ID, code: 'TRANSPORT', name: 'Transporte', isActive: true, isSystem: true },
];
const SAVED = [
  {
    id: '01900000-0000-7000-8000-0000000000f2',
    costTypeId: TYPE_ID,
    costTypeName: 'Transporte',
    amount: '11.00',
    note: null,
  },
  {
    id: '01900000-0000-7000-8000-0000000000f3',
    costTypeId: TYPE_ID,
    costTypeName: 'Transporte',
    amount: '10.50',
    note: 'Flete',
  },
];

const noop = () => undefined;

describe('montos de los costos adicionales de un ingreso guardado', () => {
  it('el campo muestra el monto como se escribe, no el decimal crudo de la API', () => {
    const lines = costsFromServer(SAVED);
    expect(lines.map((line) => line.amount)).toEqual(['11', '10.5']);
    // Y se vuelve a enviar con el mismo valor (el esquema de la API lo acepta).
    const parsed = costsToInput(lines);
    expect(parsed.ok && parsed.costs.map((cost) => cost.amount)).toEqual(['11', '10.5']);
  });

  it('en edición el campo «Monto (Bs)» no muestra «11.00» y el total sale con formato Bs', () => {
    render(
      <StockEntryCosts
        lines={costsFromServer(SAVED)}
        types={TYPES}
        editable
        saving={false}
        dirty={false}
        errors={{}}
        onChange={noop}
        onSave={noop}
      />,
    );
    const amounts = screen.getAllByLabelText('Monto (Bs)');
    expect(amounts.map((input) => (input as HTMLInputElement).value)).toEqual(['11', '10.5']);
    expect(screen.getByText(/Total de costos adicionales/).closest('p')).toHaveTextContent(/21,50/);
  });

  it('en solo lectura cada monto usa el formato de moneda (Bs 11,00)', () => {
    render(
      <StockEntryCosts
        lines={costsFromServer(SAVED)}
        types={TYPES}
        editable={false}
        saving={false}
        dirty={false}
        errors={{}}
        onChange={noop}
        onSave={noop}
      />,
    );
    const [first, second] = screen.getAllByText('Transporte', { selector: 'strong' });
    expect(first?.parentElement).toHaveTextContent(/^Transporte · Bs\s11,00$/);
    expect(second?.parentElement).toHaveTextContent(/^Transporte · Bs\s10,50 · Flete$/);
    expect(screen.queryByText(/11\.00/)).not.toBeInTheDocument();
  });

  it('el panel de costos muestra el tipo de cambio con formato de moneda', () => {
    render(<CostPanel preview={null} currency="USD" exchangeRate="6.9600" confirmed={false} />);
    expect(screen.getByText(/Tipo de cambio: Bs\s6,96 por USD\./)).toBeInTheDocument();
    expect(screen.queryByText(/6\.9600/)).not.toBeInTheDocument();
  });
});

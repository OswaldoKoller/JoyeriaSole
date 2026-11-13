import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { formatBs } from '../../lib/format.ts';
import { centsToAmount } from '../../lib/money-input.ts';
import { PieceImage } from '../catalog/photos/piece-image.tsx';
import { lineTotal, maxQuantity, pieceName, variantText, type CartLine } from './cart.ts';

/** Foto de la pieza SIEMPRE junto a su nombre, SKU y variante. */
export function PieceCell({ line }: { line: CartLine }) {
  return (
    <span className="flex items-center gap-3">
      <PieceImage variantId={line.variantId} className="size-14" />
      <span>
        <span className="block font-medium">{line.productName}</span>
        {variantText(line.variantLabel) && (
          <span className="block text-stone-700">{variantText(line.variantLabel)}</span>
        )}
        <span className="block font-mono text-xs text-stone-600">{line.sku}</span>
      </span>
    </span>
  );
}

function QuantityField({
  line,
  onChange,
}: {
  line: CartLine;
  onChange: (quantity: number) => void;
}) {
  const [text, setText] = useState(String(line.quantity));
  const [error, setError] = useState('');
  const max = maxQuantity(line);
  const name = `${pieceName(line)} (${line.sku})`;
  const errorId = `qty-${line.variantId}-error`;

  // La cantidad confirmada cambió desde fuera (+1 por escaneo): se refleja en el campo.
  const [shown, setShown] = useState(line.quantity);
  if (shown !== line.quantity) {
    setShown(line.quantity);
    setText(String(line.quantity));
  }

  function commit(value: string) {
    setText(value);
    const parsed = Number(value);
    if (!/^\d+$/.test(value.trim()) || parsed < 1) {
      setError('Mínimo 1');
      return;
    }
    if (parsed > max) {
      setError(line.available === null ? `Máximo ${max}` : `Solo hay ${max} en stock`);
      return;
    }
    setError('');
    onChange(parsed);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          className="w-10 px-0"
          aria-label={`Quitar una unidad de ${name}`}
          disabled={line.quantity <= 1}
          onClick={() => {
            commit(String(line.quantity - 1));
          }}
        >
          −
        </Button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={text}
          aria-label={`Cantidad de ${name}`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            commit(event.target.value);
          }}
          onBlur={() => {
            if (error) {
              setText(String(line.quantity));
              setError('');
            }
          }}
          className="min-h-10 w-16 rounded-lg border border-stone-300 px-2 text-center text-sm tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500"
        />
        <Button
          variant="secondary"
          className="w-10 px-0"
          aria-label={`Agregar una unidad de ${name}`}
          disabled={line.quantity >= max}
          onClick={() => {
            commit(String(line.quantity + 1));
          }}
        >
          +
        </Button>
      </div>
      {error && (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Líneas del carrito: foto junto al nombre, SKU, variante, precio, cantidad editable (tope: stock
 * disponible), subtotal y «Quitar». Nunca muestra costos. `issues` marca líneas que la API rechazó.
 */
export function CartTable({
  lines,
  issues,
  onQuantity,
  onRemove,
}: {
  lines: CartLine[];
  issues: Record<string, string>;
  onQuantity: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table-cards w-full text-left text-sm">
        <caption className="sr-only">Piezas del carrito</caption>
        <thead>
          <tr className="border-b border-stone-200 text-stone-600">
            <th scope="col" className="py-2 pr-3 font-medium">
              Pieza
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Precio
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Cantidad
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Subtotal
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Quitar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.variantId}
              className={`border-b border-stone-100 align-top ${issues[line.variantId] ? 'bg-amber-50' : ''}`}
            >
              <td className="py-3 pr-3">
                <PieceCell line={line} />
                {issues[line.variantId] && (
                  <p className="mt-2 text-sm font-medium text-amber-900">
                    {issues[line.variantId]}
                  </p>
                )}
              </td>
              <td data-label="Precio" className="py-3 pr-3 tabular-nums">
                {formatBs(line.unitPrice)}
              </td>
              <td data-label="Cantidad" className="py-3 pr-3">
                <QuantityField
                  line={line}
                  onChange={(quantity) => {
                    onQuantity(line.variantId, quantity);
                  }}
                />
              </td>
              <td data-label="Subtotal" className="py-3 pr-3 font-medium tabular-nums">
                {formatBs(centsToAmount(lineTotal(line)))}
              </td>
              <td className="py-3">
                <Button
                  variant="secondary"
                  aria-label={`Quitar ${pieceName(line)} (${line.sku}) del carrito`}
                  onClick={() => {
                    onRemove(line.variantId);
                  }}
                >
                  Quitar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

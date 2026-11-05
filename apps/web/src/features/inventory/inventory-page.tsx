import {
  PERMISSIONS,
  initialStockSchema,
  movementTypeLabel,
  type InventoryItem,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { useInitialStock, useInventory, useInventoryMovements } from './use-inventory.ts';

const levelLabels = { OUT: 'Sin stock', LOW: 'Bajo mínimo', OK: 'Disponible' };
const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function InventoryPage() {
  const [searchParams] = useSearchParams();
  const requestedSku = searchParams.get('sku') ?? '';
  const initialOnly = searchParams.get('accion') === 'inicial';
  const canAdjust = useHasPermission(PERMISSIONS.INVENTORY_ADJUST);
  const canInitialize = useHasPermission(PERMISSIONS.INVENTORY_INITIAL_STOCK);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState(requestedSku);
  const [search, setSearch] = useState(requestedSku);
  const [level, setLevel] = useState('all');
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [initialFor, setInitialFor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('Stock inicial');
  const [error, setError] = useState('');
  const list = useInventory(page, search, level, initialOnly);
  const movements = useInventoryMovements(selected?.variantId ?? null);
  const initial = useInitialStock();
  const items = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  async function submitInitial(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!initialFor) return;
    const parsed = initialStockSchema.safeParse({ quantity: Number(quantity), reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    try {
      await initial.mutateAsync({ variantId: initialFor, input: parsed.data });
      setInitialFor(null);
      setQuantity('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el stock inicial');
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{initialOnly ? 'Stock inicial' : 'Inventario'}</h1>
        <p className="text-sm text-stone-600">
          Saldos por variante, alertas e historial de movimientos.
        </p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Input
              label="Buscar por producto, SKU o código"
              value={draftSearch}
              onChange={(event) => {
                setDraftSearch(event.target.value);
              }}
              maxLength={100}
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          <div className="space-y-1">
            <label htmlFor="inventory-level" className="block text-sm font-medium">
              Estado de stock
            </label>
            <select
              id="inventory-level"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
                setPage(1);
              }}
              className="block rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="OUT">Sin stock</option>
              <option value="LOW">Bajo mínimo</option>
              <option value="OK">Disponibles</option>
            </select>
          </div>
        </form>
        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando inventario…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudo cargar el inventario.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && items.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No hay variantes para este filtro.</p>
        )}
        {list.isSuccess && items.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Producto / variante</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Piezas</th>
                  <th className="py-2 pr-4">Mínimo</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.variantId} className="border-b border-stone-100">
                    <td className="py-3 pr-4">
                      {item.productName}
                      {item.variantLabel && item.variantLabel !== 'Única'
                        ? ` · ${item.variantLabel}`
                        : ''}
                    </td>
                    <td data-label="SKU" className="py-3 pr-4">
                      {item.sku}
                    </td>
                    <td data-label="Piezas" className="py-3 pr-4 font-semibold">
                      {item.quantity}
                    </td>
                    <td data-label="Mínimo" className="py-3 pr-4">
                      {item.minStock}
                    </td>
                    <td data-label="Estado" className="py-3 pr-4">
                      {levelLabels[item.level]}
                    </td>
                    <td className="flex flex-wrap gap-2 py-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelected(item);
                        }}
                      >
                        Historial de {item.sku}
                      </Button>
                      {canAdjust && item.quantity > 0 && (
                        <Link
                          to={`/inventario/ajustes/nuevo?sku=${encodeURIComponent(item.sku)}&cero=1`}
                          aria-label={`Ajustar a cero ${item.sku}`}
                          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          Ajustar a cero
                        </Link>
                      )}
                      {canInitialize && item.canInitialize && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setInitialFor(item.variantId);
                            setError('');
                          }}
                        >
                          Stock inicial de {item.sku}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.isSuccess && total > 25 && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Anterior
            </Button>
            <span>
              Página {page} · {total} variantes
            </span>
            <Button
              variant="secondary"
              disabled={page * 25 >= total}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {initialFor && (
        <form
          onSubmit={(event) => void submitInitial(event)}
          className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
        >
          <h2 className="font-semibold">Registrar stock inicial</h2>
          <Input
            label="Cantidad en piezas"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
            required
          />
          <Input
            label="Motivo"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            maxLength={200}
            required
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={initial.isPending}>
              Registrar entrada
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setInitialFor(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {selected && (
        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Historial de {selected.sku}</h2>
            <Button
              variant="secondary"
              onClick={() => {
                setSelected(null);
              }}
            >
              Cerrar
            </Button>
          </div>
          {movements.isPending && <p role="status">Cargando movimientos…</p>}
          {movements.isError && <p role="alert">No se pudo cargar el historial.</p>}
          {movements.isSuccess && movements.data.data.length === 0 && (
            <p className="text-sm text-stone-600">Sin movimientos registrados.</p>
          )}
          {movements.isSuccess && (
            <ol className="space-y-2">
              {movements.data.data.map((movement) => (
                <li key={movement.id} className="border-t border-stone-100 pt-2 text-sm">
                  {dateTime.format(new Date(movement.createdAt))} ·{' '}
                  {movementTypeLabel(movement.type)} · {movement.quantity > 0 ? '+' : ''}
                  {movement.quantity} piezas · saldo {movement.balanceBefore} →{' '}
                  {movement.balanceAfter}
                  {movement.reason ? ` · ${movement.reason}` : ''}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </section>
  );
}

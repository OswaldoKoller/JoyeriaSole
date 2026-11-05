import { movementTypeLabel } from '@joyeria/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { useAllInventoryMovements } from './use-inventory.ts';

const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function MovementsPage() {
  const [page, setPage] = useState(1);
  const list = useAllInventoryMovements(page);
  const movements = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
        <p className="text-sm text-stone-600">Historial de entradas y ajustes por variante.</p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        {list.isPending && <p role="status">Cargando movimientos…</p>}
        {list.isError && (
          <p role="alert" className="text-red-700">
            No se pudieron cargar los movimientos.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && movements.length === 0 && (
          <p className="text-sm text-stone-600">No hay movimientos registrados.</p>
        )}
        {list.isSuccess && movements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Producto / SKU</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Cambio</th>
                  <th className="py-2 pr-4">Saldo</th>
                  <th className="py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4">{dateTime.format(new Date(movement.createdAt))}</td>
                    <td data-label="Producto" className="py-3 pr-4">
                      <div className="min-w-0">
                        {movement.productName}
                        <span className="block text-stone-500">
                          {movement.variantLabel && movement.variantLabel !== 'Única'
                            ? `${movement.variantLabel} · `
                            : ''}
                          <Link
                            to={`/inventario?sku=${encodeURIComponent(movement.sku)}`}
                            className="inline-block py-1 whitespace-nowrap text-brand-700 underline"
                          >
                            {movement.sku}
                          </Link>
                        </span>
                      </div>
                    </td>
                    <td data-label="Tipo" className="py-3 pr-4">
                      {movementTypeLabel(movement.type)}
                    </td>
                    <td data-label="Cambio" className="py-3 pr-4">
                      {movement.quantity > 0 ? '+' : ''}
                      {movement.quantity}
                    </td>
                    <td data-label="Saldo" className="py-3 pr-4">
                      {movement.balanceBefore} → {movement.balanceAfter}
                    </td>
                    <td data-label="Motivo" className="py-3">
                      {movement.reason ?? '—'}
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
              Página {page} · {total} movimientos
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
    </section>
  );
}

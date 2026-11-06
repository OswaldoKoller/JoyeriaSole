import {
  PERMISSIONS,
  SUPPLIER_CURRENCY_LABELS,
  SUPPLIER_TYPES,
  SUPPLIER_TYPE_LABELS,
  type CreateSupplierInput,
  type Supplier,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { SupplierForm } from './supplier-form.tsx';
import { useCreateSupplier, useSuppliers, useUpdateSupplier } from './use-suppliers.ts';
import { Pagination } from '../../components/ui/pagination.tsx';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

export function SuppliersPage() {
  useDocumentTitle('Proveedores');
  const canManage = useHasPermission(PERMISSIONS.SUPPLIERS_MANAGE);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [actionError, setActionError] = useState('');
  const list = useSuppliers(page, search, status, type);
  const create = useCreateSupplier();
  const update = useUpdateSupplier();

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  async function save(input: CreateSupplierInput) {
    setActionError('');
    try {
      if (editing && editing !== 'new') await update.mutateAsync({ id: editing.id, input });
      else await create.mutateAsync(input);
      setEditing(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo guardar el proveedor');
    }
  }

  async function changeStatus(supplier: Supplier) {
    const action = supplier.isActive ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Desea ${action} a ${supplier.name}?`)) return;
    setActionError('');
    try {
      await update.mutateAsync({ id: supplier.id, input: { isActive: !supplier.isActive } });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `No se pudo ${action} el proveedor`);
    }
  }

  const items = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="text-sm text-stone-600">
            Proveedores nacionales y del exterior para las recepciones de mercadería.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing('new');
              setActionError('');
            }}
          >
            Nuevo proveedor
          </Button>
        )}
      </div>

      {editing && canManage && (
        <SupplierForm
          key={editing === 'new' ? 'new' : editing.id}
          supplier={editing === 'new' ? undefined : editing}
          isPending={create.isPending || update.isPending}
          onSave={save}
          onCancel={() => {
            setEditing(null);
          }}
        />
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Input
              label="Buscar por nombre, NIT, país o contacto"
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
            <label htmlFor="supplier-status" className="block text-sm font-medium text-stone-700">
              Estado
            </label>
            <select
              id="supplier-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="supplier-type-filter"
              className="block text-sm font-medium text-stone-700"
            >
              Filtrar por tipo
            </label>
            <select
              id="supplier-type-filter"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              {SUPPLIER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {SUPPLIER_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </form>

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando proveedores…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los proveedores.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && items.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No se encontraron proveedores.</p>
        )}
        {list.isSuccess && items.length > 0 && (
          <div aria-busy={list.isPlaceholderData} className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">País</th>
                  <th className="py-2 pr-4">NIT</th>
                  <th className="py-2 pr-4">Contacto</th>
                  <th className="py-2 pr-4">Moneda</th>
                  <th className="py-2 pr-4">Estado</th>
                  {canManage && <th className="py-2">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((supplier) => (
                  <tr key={supplier.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4 font-medium">
                      {supplier.name}{' '}
                      <span
                        className={`ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          supplier.type === 'FOREIGN'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {SUPPLIER_TYPE_LABELS[supplier.type]}
                      </span>
                    </td>
                    <td data-label="País" className="py-3 pr-4">
                      {supplier.country ?? '—'}
                    </td>
                    <td data-label="NIT" className="py-3 pr-4">
                      {supplier.taxId ?? '—'}
                    </td>
                    <td data-label="Contacto" className="py-3 pr-4">
                      {supplier.contactName ?? supplier.phone ?? supplier.whatsapp ?? '—'}
                    </td>
                    <td data-label="Moneda" className="py-3 pr-4">
                      {SUPPLIER_CURRENCY_LABELS[supplier.defaultCurrency]}
                    </td>
                    <td data-label="Estado" className="py-3 pr-4">
                      {supplier.isActive ? 'Activo' : 'Inactivo'}
                    </td>
                    {canManage && (
                      <td className="flex gap-2 py-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(supplier);
                            setActionError('');
                          }}
                        >
                          Editar {supplier.name}
                        </Button>
                        <Button
                          variant={supplier.isActive ? 'danger' : 'secondary'}
                          disabled={update.isPending}
                          onClick={() => void changeStatus(supplier)}
                        >
                          {supplier.isActive ? 'Desactivar' : 'Activar'} {supplier.name}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.isSuccess && (
          <Pagination page={page} total={total} noun="proveedores" onPageChange={setPage} />
        )}
      </div>
    </section>
  );
}

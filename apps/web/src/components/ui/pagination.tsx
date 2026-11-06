import { useEffect, useRef } from 'react';
import { lastPageOf, PAGE_SIZE } from '../../lib/paging.ts';
import { Button } from './button.tsx';

type Props = {
  /** Página actual (desde 1). */
  page: number;
  /** Total de registros que informa la API. */
  total: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  /** Plural de lo que se lista, para el resumen: «45 productos». */
  noun: string;
  className?: string;
};

/**
 * Navegación entre páginas de un listado. Los botones permanecen montados (solo se deshabilitan)
 * para que el foco no se pierda al cambiar de página, y el resumen es una región `aria-live`.
 * No se muestra si todo cabe en una página. Sin lógica de negocio: recibe y devuelve números.
 */
export function Pagination({
  page,
  total,
  onPageChange,
  pageSize = PAGE_SIZE,
  noun,
  className = 'mt-4',
}: Props) {
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef<'previous' | 'next' | null>(null);

  // El botón pulsado se deshabilita al llegar al extremo: tras renderizar, el foco pasa al opuesto.
  useEffect(() => {
    const target = refocus.current;
    refocus.current = null;
    if (target === 'previous') previousRef.current?.focus();
    if (target === 'next') nextRef.current?.focus();
  }, [page]);

  if (total <= pageSize) return null;

  const last = lastPageOf(total, pageSize);

  function go(target: number) {
    if (target >= last) refocus.current = 'previous';
    else if (target <= 1) refocus.current = 'next';
    onPageChange(target);
  }

  return (
    <nav
      aria-label="Paginación"
      className={`flex flex-wrap items-center gap-3 text-sm ${className}`}
    >
      <Button
        ref={previousRef}
        variant="secondary"
        disabled={page <= 1}
        onClick={() => {
          go(page - 1);
        }}
      >
        Anterior
      </Button>
      <p aria-live="polite" aria-atomic="true">
        Página {page} de {last} · {total} {noun}
      </p>
      <Button
        ref={nextRef}
        variant="secondary"
        disabled={page >= last}
        onClick={() => {
          go(page + 1);
        }}
      >
        Siguiente
      </Button>
    </nav>
  );
}

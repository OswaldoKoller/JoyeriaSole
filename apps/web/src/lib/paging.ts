import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query';

/** Tamaño de página de los listados de la aplicación. */
export const PAGE_SIZE = 25;
/** Tamaño de página de los historiales anidados (precios, costos, ajustes de una pieza). */
export const SMALL_PAGE_SIZE = 10;

/** Respuesta paginada estándar de la API: `{ data, meta }`. */
export type Paged<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };

/** Número de páginas (mínimo 1). */
export function lastPageOf(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Consulta de un listado paginado. Conserva la página anterior mientras llega la siguiente
 * (`placeholderData`): la tabla no se desmonta, el foco no se pierde y no parpadea. Quien la usa
 * puede leer `isPlaceholderData` para marcar la región como ocupada (`aria-busy`).
 */
export function useListQuery<T>(queryKey: QueryKey, queryFn: () => Promise<Paged<T>>) {
  return useQuery({ queryKey, queryFn, placeholderData: keepPreviousData });
}

import {
  MAX_VARIANT_COVERS_PER_REQUEST,
  variantCoverSchema,
  type ProductPhoto,
} from '@joyeria/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api-client.ts';

/**
 * Portada de una pieza por su variante (DT-DAT-17). Las pantallas muestran decenas de piezas:
 * en vez de pedir y revalidar una imagen `/cover` por fila, las consultas de un mismo momento se
 * agrupan en UNA petición `GET /products/variants/covers?ids=…` y la imagen se pide luego por su
 * URL inmutable (caché del navegador de un año).
 *
 * La clave cuelga de `['products']`: subir, borrar o cambiar la portada ya invalida esa clave
 * (`use-product-photos.ts`), así que la pieza cambia de foto al instante para quien la editó.
 */
export const variantCoverKey = (variantId: string) =>
  ['products', 'variant-cover', variantId] as const;

/** Las portadas cambian muy poco: se reutilizan 5 minutos al navegar entre pantallas. */
const COVER_STALE_TIME_MS = 5 * 60 * 1000;
/** Espera para juntar las piezas que una pantalla pide al mismo tiempo. */
const BATCH_DELAY_MS = 10;

type Waiter = { resolve: (photo: ProductPhoto | null) => void; reject: (error: unknown) => void };

const queue = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | undefined;

const coversResponse = variantCoverSchema.array();

async function fetchChunk(variantIds: string[], waiters: Map<string, Waiter[]>) {
  try {
    const response = await api.get<{ data: unknown }>(
      `/products/variants/covers?ids=${variantIds.join(',')}`,
    );
    const parsed = coversResponse.safeParse(response.data);
    if (!parsed.success) throw new Error('Respuesta de portadas inesperada');
    const byVariant = new Map(parsed.data.map((cover) => [cover.variantId, cover.photo]));
    for (const variantId of variantIds) {
      for (const waiter of waiters.get(variantId) ?? []) {
        waiter.resolve(byVariant.get(variantId) ?? null);
      }
    }
  } catch (error) {
    for (const variantId of variantIds) {
      for (const waiter of waiters.get(variantId) ?? []) waiter.reject(error);
    }
  }
}

function flush() {
  timer = undefined;
  const waiters = new Map(queue);
  queue.clear();
  const ids = [...waiters.keys()];
  for (let start = 0; start < ids.length; start += MAX_VARIANT_COVERS_PER_REQUEST) {
    void fetchChunk(ids.slice(start, start + MAX_VARIANT_COVERS_PER_REQUEST), waiters);
  }
}

/** Pide la portada de una variante; se agrupa con las demás pedidas en el mismo instante. */
export function loadVariantCover(variantId: string): Promise<ProductPhoto | null> {
  return new Promise((resolve, reject) => {
    const waiters = queue.get(variantId) ?? [];
    waiters.push({ resolve, reject });
    queue.set(variantId, waiters);
    timer ??= setTimeout(flush, BATCH_DELAY_MS);
  });
}

export function useVariantCover(variantId: string | null | undefined) {
  const id = variantId ?? '';
  return useQuery({
    queryKey: variantCoverKey(id),
    queryFn: () => loadVariantCover(id),
    enabled: id !== '',
    staleTime: COVER_STALE_TIME_MS,
  });
}

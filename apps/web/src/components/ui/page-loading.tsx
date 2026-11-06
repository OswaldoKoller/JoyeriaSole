/** Indicador de carga de una sección que se descarga bajo demanda (anunciado a lectores de pantalla). */
export function PageLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-10 text-center text-sm text-stone-600">
      {label}
    </div>
  );
}

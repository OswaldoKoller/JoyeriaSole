/** Marcador de carga con dimensiones fijas por el llamador: evita saltos de diseño (CLS = 0). */
export function Skeleton({ className = '' }: { className?: string }) {
  // Si el llamador define su propio radio (p. ej. rounded-full) no se aplica el de por defecto.
  const radius = className.includes('rounded') ? '' : 'rounded-md';
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-stone-200/70 motion-reduce:animate-none ${radius} ${className}`}
    />
  );
}

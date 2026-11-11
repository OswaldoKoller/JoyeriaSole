import type { ComponentProps } from 'react';
import { Link } from 'react-router';

type Variant = 'primary' | 'secondary';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100',
};

/** Enlace de navegación con la apariencia de un botón (mismo tamaño táctil y foco visible). */
export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

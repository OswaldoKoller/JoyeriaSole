import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

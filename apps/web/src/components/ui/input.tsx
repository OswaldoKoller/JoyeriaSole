import { useId, type ComponentProps } from 'react';

export function Input({
  label,
  error,
  className = '',
  id: idProp,
  'aria-describedby': describedBy,
  ...props
}: ComponentProps<'input'> & { label: string; error?: string }) {
  const generatedId = useId();
  // Respeta el `id` del llamador (enlaces, pruebas, anclas); si no hay, genera uno único.
  const id = idProp ?? generatedId;
  const errorId = `${id}-error`;
  // Combina la ayuda que pasa el llamador con el mensaje de error propio.
  const describedByIds = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ');
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedByIds || undefined}
        className={`block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-500 ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

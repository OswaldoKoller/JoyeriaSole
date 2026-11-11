import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  /** Título visible del diálogo (también es su nombre accesible). */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Mientras hay una operación en curso no se cierra con Esc ni con el fondo. */
  busy?: boolean;
  /** Ancho máximo (clase de Tailwind). */
  widthClassName?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible y genérico (sin lógica de negocio): `role="dialog"` con `aria-modal`,
 * el foco entra al primer elemento con `data-autofocus` (o al botón «Cerrar»), Tab no sale del
 * diálogo, Esc lo cierra y al cerrarse el foco vuelve al elemento que lo abrió.
 */
export function Dialog({
  title,
  onClose,
  children,
  busy = false,
  widthClassName = 'max-w-lg',
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // El padre crea «onClose» y cambia «busy» en cada render: se leen desde refs para no repetir
  // el efecto de foco (que debe ejecutarse solo al abrir y al cerrar).
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? closeRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusables[0];
      const last = focusables.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={`Cerrar: ${title}`}
        tabIndex={-1}
        onClick={() => {
          if (!busy) onClose();
        }}
        className="absolute inset-0 bg-stone-900/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${widthClassName}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none disabled:opacity-60"
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

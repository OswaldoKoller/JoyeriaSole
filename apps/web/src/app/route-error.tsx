import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { useDocumentTitle } from '../lib/use-document-title.ts';

/**
 * Pantalla de error de una ruta (fallo al renderizar o al descargar la sección). Sustituye la
 * pantalla genérica en inglés de React Router. El detalle técnico no se muestra al usuario.
 */
export function RouteError() {
  const error = useRouteError();
  useDocumentTitle('Error');
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div role="alert" className="mx-auto max-w-md space-y-3 py-10 text-center">
      <h1 className="text-xl font-semibold">
        {notFound ? 'Página no encontrada' : 'Algo salió mal'}
      </h1>
      <p className="text-sm text-stone-600">
        {notFound
          ? 'La dirección no existe.'
          : 'No se pudo mostrar esta sección. Si acaba de publicarse una versión nueva, recargue la página. Si el problema continúa, avise al administrador.'}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {!notFound && (
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Recargar la página
          </button>
        )}
        <Link
          to="/"
          className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}

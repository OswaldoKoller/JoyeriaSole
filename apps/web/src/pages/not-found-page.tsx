import { Link } from 'react-router';
import { FullPageMessage } from '../components/ui/full-page-message.tsx';
import { useDocumentTitle } from '../lib/use-document-title.ts';

export function NotFoundPage() {
  useDocumentTitle('Página no encontrada');
  return (
    <FullPageMessage>
      <span>
        Página no encontrada.{' '}
        <Link to="/" className="inline-flex min-h-10 items-center text-brand-700 underline">
          Volver al inicio
        </Link>
      </span>
    </FullPageMessage>
  );
}

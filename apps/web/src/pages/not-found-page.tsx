import { Link } from 'react-router';
import { FullPageMessage } from '../components/ui/full-page-message.tsx';

export function NotFoundPage() {
  return (
    <FullPageMessage>
      <span>
        Página no encontrada.{' '}
        <Link to="/" className="inline-flex min-h-10 items-center text-brand-600 underline">
          Volver al inicio
        </Link>
      </span>
    </FullPageMessage>
  );
}

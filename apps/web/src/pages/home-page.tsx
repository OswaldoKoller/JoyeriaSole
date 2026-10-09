import { useCurrentUser } from '../features/auth/use-auth.ts';

/** Página de inicio provisional. Los módulos de Fase 1 se agregarán tras su aprobación. */
export function HomePage() {
  const { data: user } = useCurrentUser();
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Bienvenido/a, {user?.name}</h1>
      <p className="text-sm text-stone-600">
        Entorno preparado. Los módulos de inventario se habilitarán en la Fase 1.
      </p>
      <p className="text-xs text-stone-400">Roles: {user?.roles.join(', ')}</p>
    </section>
  );
}

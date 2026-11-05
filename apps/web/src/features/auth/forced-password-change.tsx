import { Button } from '../../components/ui/button.tsx';
import { ChangePasswordForm } from './change-password-form.tsx';
import { useCurrentUser, useLogout } from './use-auth.ts';

/**
 * Pantalla obligatoria cuando el Administrador restableció la clave (F2): hasta cambiarla no se
 * muestra ninguna otra ruta. La API también lo exige (403 PASSWORD_CHANGE_REQUIRED).
 */
export function ForcedPasswordChange() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-brand-700">Joyería Sole</h1>
          <p className="text-sm text-stone-500">{user?.email}</p>
        </div>
        <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          El Administrador le asignó una contraseña temporal. Debe elegir una contraseña nueva antes
          de continuar.
        </div>
        <ChangePasswordForm temporary />
        <div className="text-center">
          <Button
            variant="secondary"
            onClick={() => {
              logout.mutate();
            }}
            disabled={logout.isPending}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
    </main>
  );
}

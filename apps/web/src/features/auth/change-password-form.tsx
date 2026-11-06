import { changePasswordSchema } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useChangePassword } from './use-auth.ts';

/**
 * Formulario de cambio de contraseña propia. Con `temporary` (clave asignada por el Administrador)
 * pide la clave temporal como «actual». Al terminar se cierran las sesiones y se vuelve al login.
 */
export function ChangePasswordForm({ temporary = false }: { temporary?: boolean }) {
  const changePassword = useChangePassword();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    const result = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    try {
      await changePassword.mutateAsync(result.data);
      await navigate('/login', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar la contraseña');
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
    >
      <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
      <p className="text-sm text-stone-600">
        Usa al menos 10 caracteres. Después del cambio deberás iniciar sesión de nuevo.
      </p>
      <Input
        label={temporary ? 'Contraseña temporal' : 'Contraseña actual'}
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => {
          setCurrentPassword(event.target.value);
        }}
        required
      />
      <Input
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => {
          setNewPassword(event.target.value);
        }}
        required
      />
      <Input
        label="Confirmar contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
        }}
        required
      />
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={changePassword.isPending}>
        {changePassword.isPending ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  );
}

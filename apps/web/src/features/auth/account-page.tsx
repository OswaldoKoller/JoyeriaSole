import { changePasswordSchema } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useChangePassword, useCurrentUser } from './use-auth.ts';

export function AccountPage() {
  const { data: user } = useCurrentUser();
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
    <section className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-stone-600">
          {user?.name} · {user?.email}
        </p>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
      >
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
        <p className="text-sm text-stone-600">
          Usa al menos 10 caracteres. Después del cambio deberás iniciar sesión de nuevo.
        </p>
        <Input
          label="Contraseña actual"
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
    </section>
  );
}

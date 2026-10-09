import { loginSchema } from '@joyeria/shared';
import { useState, type SubmitEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useCurrentUser, useLogin } from './use-auth.ts';

export function LoginPage() {
  const { data: user } = useCurrentUser();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    try {
      await login.mutateAsync(parsed.data);
      await navigate(from, { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión');
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="w-full max-w-sm space-y-5 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-brand-700">Joyería Sole</h1>
          <p className="text-sm text-stone-500">Inventario y control de productos</p>
        </div>

        <Input
          label="Correo electrónico"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <Input
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </main>
  );
}

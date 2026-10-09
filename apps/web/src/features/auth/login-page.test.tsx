import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../test/render.tsx';
import { LoginPage } from './login-page.tsx';

describe('LoginPage', () => {
  it('valida el correo antes de llamar a la API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' } }),
      );
    renderWithProviders(<LoginPage />, { route: '/login' });

    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'no-es-correo');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'algo');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo inválido');
    // Solo la consulta inicial de sesión (/auth/me), ningún intento de login.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de error que devuelve la API', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const message = url.endsWith('/auth/login')
        ? 'Correo o contraseña incorrectos'
        : 'Debe iniciar sesión';
      return jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message } });
    });
    renderWithProviders(<LoginPage />, { route: '/login' });

    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'admin@test.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });
});

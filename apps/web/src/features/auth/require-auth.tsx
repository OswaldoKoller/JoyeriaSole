import type { Permission } from '@joyeria/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { FullPageMessage } from '../../components/ui/full-page-message.tsx';
import { useCurrentUser } from './use-auth.ts';

/**
 * Protege rutas en el frontend. Es solo experiencia de usuario: la seguridad real está en la API,
 * que valida sesión y permisos en cada petición.
 */
export function RequireAuth({
  children,
  permissions = [],
  anyPermissions,
}: {
  children: ReactNode;
  /** El usuario debe tener TODOS. */
  permissions?: Permission[];
  /** El usuario debe tener AL MENOS UNO (p. ej. solicitar o aprobar precios). */
  anyPermissions?: Permission[];
}) {
  const { data: user, isPending, isError } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <FullPageMessage>Cargando…</FullPageMessage>;
  if (isError) return <FullPageMessage>No se pudo conectar con el servidor.</FullPageMessage>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (
    !permissions.every((p) => user.permissions.includes(p)) ||
    (anyPermissions && !anyPermissions.some((p) => user.permissions.includes(p)))
  ) {
    return <FullPageMessage>No tiene permiso para ver esta sección.</FullPageMessage>;
  }
  return children;
}

import { z } from 'zod';
import type { Permission, RoleCode } from '../permissions.ts';
import { PASSWORD_MIN_LENGTH } from './users.ts';

export const loginSchema = z.object({
  email: z.email('Correo inválido').trim().toLowerCase().max(254),
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Respuesta de `POST /auth/login`: indica si la clave es temporal y debe cambiarse antes de seguir. */
export const loginResultSchema = z.object({ mustChangePassword: z.boolean() });
export type LoginResult = z.infer<typeof loginResultSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(200),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Usuario autenticado tal como lo expone `GET /api/v1/auth/me`. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: RoleCode[];
  permissions: Permission[];
  /** Clave temporal (F2): hasta cambiarla, la API solo atiende `/auth/*`. */
  mustChangePassword: boolean;
}

import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;

const roleIdsSchema = z
  .array(z.uuid())
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, 'No repita roles');

export const userSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  isActive: z.boolean(),
  /** Tiene una clave temporal asignada por el Administrador y aún no la cambió. */
  mustChangePassword: z.boolean(),
  roles: z.array(z.object({ code: z.string(), name: z.string() })),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;

export const updateUserSchema = z
  .object({ name: z.string().trim().min(1).max(120).optional(), isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'Indique al menos un campo para actualizar');

export const assignUserRolesSchema = z.object({
  roleIds: roleIdsSchema,
});

export const createUserSchema = z.object({
  email: z.email('Correo inválido').trim().toLowerCase().max(254),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
  roleIds: roleIdsSchema,
});

/** Restablecimiento por el Administrador (F2): clave temporal que la persona debe cambiar al entrar. */
export const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(PASSWORD_MIN_LENGTH).max(200),
});

export const roleSummarySchema = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignUserRolesInput = z.infer<typeof assignUserRolesSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RoleSummary = z.infer<typeof roleSummarySchema>;

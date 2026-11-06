import { z } from 'zod';

/** Texto máximo de los filtros de auditoría (coincide con las columnas de `audit_logs`). */
const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Fecha-hora ISO con zona (p. ej. 2026-11-05T14:00:00.000Z). */
const isoDateTime = z.iso.datetime({ offset: true });

/**
 * Filtros de `GET /audit`. `action` coincide exacto o por prefijo si termina en `.` o `*`
 * (p. ej. `price.`). `from`/`to` son un intervalo cerrado y `from` no puede ser posterior a `to`.
 */
export const auditListQuerySchema = z
  .object({
    userId: z.uuid().optional(),
    action: optionalText(80),
    entityType: optionalText(60),
    entityId: optionalText(64),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    q: optionalText(100),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    path: ['to'],
    message: 'La fecha «hasta» no puede ser anterior a «desde»',
  });
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

const auditUserSchema = z.object({ id: z.uuid(), name: z.string(), email: z.string() });

/** Valor JSON arbitrario (antes/después/metadatos), ya con las claves sensibles redactadas. */
export const auditJsonSchema = z.json().nullable();

export const auditEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  user: auditUserSchema.nullable(),
  ip: z.string().nullable(),
  requestId: z.string().nullable(),
  before: auditJsonSchema,
  after: auditJsonSchema,
  metadata: auditJsonSchema,
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditDetailSchema = auditEntrySchema.extend({ userAgent: z.string().nullable() });
export type AuditDetail = z.infer<typeof auditDetailSchema>;

export const auditIdParamsSchema = z.object({ id: z.string().regex(/^\d{1,18}$/) });

/** Valores existentes para poblar los filtros de la pantalla. */
export const auditFiltersSchema = z.object({
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
  users: z.array(auditUserSchema),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

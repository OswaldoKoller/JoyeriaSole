import { z } from 'zod';
import { parseMoney } from '../costing.ts';
import { MONEY_INPUT_MAX, MONEY_PATTERN, PAGE_MAX } from '../sales.ts';

/**
 * Importe en Bs como texto: «0», «12.5», «1500.00» (hasta 10 enteros y 2 decimales, punto decimal).
 * Vacío NO es cero (D-05): un campo vacío es un error, el cero se escribe de forma explícita.
 */
export const moneyInputSchema = z
  .string({ error: 'Indique un importe' })
  .trim()
  .regex(MONEY_PATTERN, 'Importe inválido: use números con hasta 2 decimales (p. ej. 150.50)')
  // Límite técnico (no de negocio): ver MONEY_INPUT_MAX.
  .refine(
    (value) => !MONEY_PATTERN.test(value) || parseMoney(value) <= parseMoney(MONEY_INPUT_MAX),
    'El importe supera el máximo que el sistema puede registrar (Bs 99 999 999,99)',
  );

/** Importe estrictamente mayor que cero. */
export const positiveMoneyInputSchema = moneyInputSchema.refine(
  // Zod evalúa el refine aunque el formato ya haya fallado: solo se convierte un importe válido.
  (value) => MONEY_PATTERN.test(value) && parseMoney(value) > 0n,
  'El importe debe ser mayor que cero',
);

/** Importe de una respuesta: siempre texto con 2 decimales (con signo en las diferencias). */
export const moneyOutputSchema = z.string();

/** Texto opcional: vacío o solo espacios se guarda como `null`. */
export function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

/** Página y tamaño de página de los listados. */
export const pageQueryShape = {
  page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export const userRefSchema = z.strictObject({ id: z.uuid(), name: z.string() });

export const pageMetaSchema = z.strictObject({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

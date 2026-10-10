import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    FRONTEND_URL: z.url().default('http://localhost:5173'),

    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET debe tener al menos 32 caracteres'),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .refine((hours) => hours === 3, 'La sesión debe durar 3 horas')
      .default(3),
    /**
     * Intentos de login (y de cambio de contraseña) permitidos cada 15 minutos por IP.
     * Solo se sube en el servidor de pruebas E2E, que inicia sesión muchas veces desde una IP.
     */
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(10),
    /** Solo se desactiva para pruebas locales de la imagen de producción sin HTTPS. */
    COOKIE_SECURE: booleanString,
    /**
     * Confiar en X-Forwarded-For (IP real del cliente). Activar SOLO detrás de un proxy/balanceador
     * propio del hosting; si no, un atacante podría falsear su IP y evadir el rate limiting.
     */
    TRUST_PROXY: booleanString,

    /** Carpeta con el frontend compilado. Si existe, la API lo sirve (despliegue de una sola unidad). */
    WEB_DIST_DIR: z.string().optional(),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

export type Env = z.infer<typeof envSchema>;

/**
 * Valida las variables de entorno al arrancar. Si falta algo, la aplicación no inicia
 * (falla rápido en vez de fallar en mitad de una operación).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Render, Railway y similares inyectan PORT; API_PORT explícito tiene prioridad.
  const result = envSchema.safeParse({ ...source, API_PORT: source.API_PORT ?? source.PORT });
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}

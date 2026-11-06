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
    /** Sesión fija de 8 horas desde el login, sin extensión por actividad (P-19, Q-02; ADR-003). */
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .refine((hours) => hours === 8, 'La sesión debe durar 8 horas')
      .default(8),
    /**
     * Intentos de login (y de cambio de contraseña) permitidos cada 15 minutos por IP.
     * Solo se sube en el servidor de pruebas E2E, que inicia sesión muchas veces desde una IP.
     */
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(10),
    /** Solo se desactiva para pruebas locales de la imagen de producción sin HTTPS. */
    COOKIE_SECURE: booleanString,
    /**
     * Número de proxies/balanceadores PROPIOS delante de la API cuyo `X-Forwarded-For` se acepta
     * (0 = ninguno: se usa la IP del socket). Se cuenta desde el último salto, de modo que las
     * entradas que añada el cliente a la izquierda de la cabecera no se toman como su IP.
     * Sustituye al antiguo booleano `TRUST_PROXY`, que confiaba en TODA la cadena y permitía
     * falsear la IP para evadir el límite de intentos de login.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    /** Carpeta con el frontend compilado. Si existe, la API lo sirve (despliegue de una sola unidad). */
    WEB_DIST_DIR: z.string().optional(),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

export type Env = z.infer<typeof envSchema>;

/** Avisos de configuración riesgosa que se registran al arrancar (no impiden iniciar). */
export function startupWarnings(env: Pick<Env, 'NODE_ENV' | 'COOKIE_SECURE'>): string[] {
  const warnings: string[] = [];
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    warnings.push(
      'COOKIE_SECURE=false en producción: la cookie de sesión viajaría sin Secure. ' +
        'Úselo solo para probar la imagen en local sin HTTPS.',
    );
  }
  return warnings;
}

/**
 * Valida las variables de entorno al arrancar. Si falta algo, la aplicación no inicia
 * (falla rápido en vez de fallar en mitad de una operación).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Ruptura de compatibilidad: el booleano confiaba en toda la cadena X-Forwarded-For.
  if (source.TRUST_PROXY?.trim().toLowerCase() === 'true') {
    throw new Error(
      'Variables de entorno inválidas:\n  - TRUST_PROXY: ya no existe; usar TRUST_PROXY_HOPS ' +
        '(número de proxies propios delante de la API, p. ej. 1)',
    );
  }
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

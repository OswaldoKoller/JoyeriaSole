import { z } from 'zod';

// Mensajes de validación por defecto en español (API y frontend comparten esta configuración).
z.config(z.locales.es());

export * from './api.ts';
export * from './permissions.ts';
export * from './schemas/auth.ts';

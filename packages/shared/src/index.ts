import { z } from 'zod';

// Mensajes de validación por defecto en español (API y frontend comparten esta configuración).
z.config(z.locales.es());

export * from './api.ts';
export * from './costing.ts';
export * from './permissions.ts';
export * from './schemas/auth.ts';
export * from './schemas/suppliers.ts';
export * from './schemas/users.ts';
export * from './schemas/categories.ts';
export * from './schemas/attributes.ts';
export * from './schemas/products.ts';
export * from './schemas/inventory.ts';
export * from './schemas/stock-entries.ts';
export * from './schemas/adjustments.ts';
export * from './schemas/inventory-counts.ts';
export * from './schemas/exchanges.ts';

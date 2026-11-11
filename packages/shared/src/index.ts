import { z } from 'zod';

// Mensajes de validación por defecto en español (API y frontend comparten esta configuración).
z.config(z.locales.es());

export * from './api.ts';
export * from './costing.ts';
export * from './dates.ts';
export * from './permissions.ts';
export * from './pricing.ts';
export * from './reference-types.ts';
export * from './sales.ts';
export * from './schemas/auth.ts';
export * from './schemas/suppliers.ts';
export * from './schemas/users.ts';
export * from './schemas/roles.ts';
export * from './schemas/categories.ts';
export * from './schemas/attributes.ts';
export * from './schemas/products.ts';
export * from './schemas/photos.ts';
export * from './schemas/inventory.ts';
export * from './schemas/stock-entries.ts';
export * from './schemas/adjustments.ts';
export * from './schemas/inventory-counts.ts';
export * from './schemas/stock-entry-cost-types.ts';
export * from './schemas/pricing.ts';
export * from './schemas/exchanges.ts';
export * from './schemas/approvals.ts';
export * from './schemas/audit.ts';
export * from './schemas/money.ts';
export * from './schemas/cash.ts';
export * from './schemas/sales.ts';
export * from './schemas/sale-incidents.ts';
export * from './schemas/business-settings.ts';

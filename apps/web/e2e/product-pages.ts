import { expect, type Page } from '@playwright/test';

/** Desde el listado de Productos abre la ficha completa de un producto (clic en su tarjeta). */
export async function openProduct(page: Page, name: string) {
  await page.getByRole('link', { name: `Ver ficha de ${name}` }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Tarjeta de un producto en el listado (un enlace a su ficha). */
export const productTile = (page: Page, name: string) =>
  page.getByRole('link', { name: `Ver ficha de ${name}` });

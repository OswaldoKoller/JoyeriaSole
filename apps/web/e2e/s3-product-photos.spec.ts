import { expect, test, type Page } from '@playwright/test';

/**
 * S3 · Fotos de producto, con los usuarios DEMO de `npm run db:seed:demo` (se ejecuta dentro de
 * `npm run qa:e2e`). El Responsable sube, marca portada, reordena y elimina; el Vendedor solo ve.
 * Los dos primeros productos DEMO (Anillos) ya traen una foto sintética.
 */
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
const USERS = {
  inventario: 'demo-inventario@example.invalid',
  vendedor: 'demo-vendedor@example.invalid',
};

test.skip(!DEMO_PASSWORD, 'Definir DEMO_USER_PASSWORD (npm run qa lo genera)');

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });
const card = (page: Page, name: string) => page.getByRole('article').filter({ hasText: name });

// PNG válido de 1×1 px (67 bytes): evita guardar binarios en el repositorio.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(menu(page)).toBeVisible();
}

async function search(page: Page, term: string) {
  await menu(page).getByRole('link', { name: 'Productos' }).click();
  await page.getByLabel('Buscar por nombre, SKU o código de barras').fill(term);
  await page.getByRole('button', { name: 'Buscar' }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Responsable de inventario', () => {
  test('sube, marca portada, reordena y elimina fotos con confirmación', async ({ page }) => {
    await login(page, USERS.inventario);
    await search(page, 'Cruz Clásica');
    const product = card(page, 'Cruz Clásica');
    await expect(product).toHaveCount(1);
    const name = (await product.getByRole('heading').first().innerText()).split('\n')[0] ?? '';

    await expect(product.getByText('Sin foto')).toBeVisible();
    await product.getByRole('button', { name: /^Fotos de .* \(0\)$/ }).click();
    await expect(product.getByText('Este producto todavía no tiene fotos.')).toBeVisible();

    // Un archivo que NO es imagen aunque se declare como JPG: la API lo rechaza por su contenido.
    await product.getByLabel(/^Subir foto de /).setInputFiles({
      name: 'falsa.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('<html><script>alert(1)</script></html>'),
    });
    await expect(product.getByRole('alert')).toContainText('no es una imagen válida');
    await expect(product.getByRole('img')).toHaveCount(0);

    // Dos fotos reales: la primera queda como portada y aparece la miniatura en la ficha.
    await product.getByLabel(/^Subir foto de /).setInputFiles([
      { name: 'uno.png', mimeType: 'image/png', buffer: PNG_1X1 },
      { name: 'dos.png', mimeType: 'image/png', buffer: PNG_1X1 },
    ]);
    await expect(product.getByRole('button', { name: /^Fotos de .* \(2\)$/ })).toBeVisible();
    const gallery = product.getByRole('region', { name: /^Fotos de / });
    await expect(gallery.getByRole('img')).toHaveCount(2);
    await expect(gallery.getByText('Portada', { exact: true })).toHaveCount(1);
    await expect(product.getByRole('img', { name: `Foto de portada de ${name}` })).toBeVisible();
    // La imagen se sirve realmente desde la API (WebP, 1×1).
    await expect
      .poll(() =>
        gallery
          .getByRole('img')
          .first()
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
      )
      .toBe(1);

    // Marcar la segunda como portada: la insignia pasa a la segunda foto.
    await gallery.getByRole('button', { name: `Marcar como portada la foto 2 de ${name}` }).click();
    await expect(
      gallery.getByRole('button', { name: `Marcar como portada la foto 1 de ${name}` }),
    ).toBeVisible();
    await expect(
      gallery.getByRole('button', { name: `Marcar como portada la foto 2 de ${name}` }),
    ).toHaveCount(0);

    // Reordenar: mover la foto 1 después deja la portada en primer lugar.
    await gallery.getByRole('button', { name: `Mover después la foto 1 de ${name}` }).click();
    await expect(
      gallery.getByRole('button', { name: `Mover antes la foto 1 de ${name}` }),
    ).toBeDisabled();
    await expect(
      gallery.getByRole('listitem').first().getByText('Portada', { exact: true }),
    ).toBeVisible();

    // Eliminar pide confirmación; cancelar no borra.
    await gallery.getByRole('button', { name: `Eliminar la foto 1 de ${name}` }).click();
    await expect(page.getByRole('alertdialog')).toContainText('¿Eliminar esta foto?');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(gallery.getByRole('img')).toHaveCount(2);
    await gallery.getByRole('button', { name: `Eliminar la foto 1 de ${name}` }).click();
    await page.getByRole('button', { name: 'Sí, eliminar foto' }).click();
    await expect(gallery.getByRole('img')).toHaveCount(1);
    // La foto restante hereda la portada.
    await expect(gallery.getByText('Portada', { exact: true })).toHaveCount(1);

    // Límite de 5 fotos: tras subir 4 más, el selector se deshabilita.
    const uploads = Array.from({ length: 4 }, (_, i) => ({
      name: `extra-${i}.png`,
      mimeType: 'image/png',
      buffer: PNG_1X1,
    }));
    await product.getByLabel(/^Subir foto de /).setInputFiles(uploads);
    await expect(gallery.getByRole('img')).toHaveCount(5);
    await expect(product.getByLabel(/^Subir foto de /)).toBeDisabled();
    await expect(product.getByText(/ya tiene 5 fotos/)).toBeVisible();
  });
});

test.describe('Vendedor', () => {
  test('ve las fotos pero no puede subir, cambiar portada, ordenar ni eliminar', async ({
    page,
  }) => {
    await login(page, USERS.vendedor);
    await search(page, 'Solitario Circona');
    const product = card(page, 'Solitario Circona');
    await expect(product.getByRole('img', { name: /^Foto de portada de / })).toBeVisible();
    await product.getByRole('button', { name: /^Fotos de .* \(1\)$/ }).click();
    const gallery = product.getByRole('region', { name: /^Fotos de / });
    await expect(gallery.getByRole('img')).toHaveCount(1);
    await expect(gallery.getByText('Portada', { exact: true })).toBeVisible();
    await expect(gallery.getByRole('button')).toHaveCount(0);
    await expect(product.getByLabel(/^Subir foto de /)).toHaveCount(0);

    // La API lo confirma: puede leer la imagen pero no subir ni borrar.
    const photoUrl = await gallery.getByRole('img').first().getAttribute('src');
    expect(photoUrl).toMatch(/^\/api\/v1\/products\/.+\/photos\/.+/);
    const image = await page.request.get(photoUrl ?? '');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/webp');
    expect(image.headers()['x-content-type-options']).toBe('nosniff');
    const productId = /products\/([^/]+)\//.exec(photoUrl ?? '')?.[1] ?? '';
    const origin = new URL(page.url()).origin;
    const upload = await page.request.post(`/api/v1/products/${productId}/photos`, {
      headers: { origin },
      multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: PNG_1X1 } },
    });
    expect(upload.status()).toBe(403);
  });
});

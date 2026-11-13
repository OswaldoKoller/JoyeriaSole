import { vi } from 'vitest';

/**
 * jsdom no implementa `URL.createObjectURL`/`revokeObjectURL` (las usa la descarga de archivos).
 * Las sustituye por espías y devuelve los blobs creados, las URL revocadas y `restore()`.
 * Se accede por un registro genérico para no tomar los métodos sueltos del objeto `URL`.
 */
export function mockBlobUrls() {
  const target = URL as unknown as Record<string, unknown>;
  const saved = { create: target.createObjectURL, revoke: target.revokeObjectURL };
  const blobs: Blob[] = [];
  const revoked: string[] = [];
  target.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:csv-de-prueba';
  });
  target.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
  return {
    blobs,
    revoked,
    restore() {
      target.createObjectURL = saved.create;
      target.revokeObjectURL = saved.revoke;
    },
  };
}

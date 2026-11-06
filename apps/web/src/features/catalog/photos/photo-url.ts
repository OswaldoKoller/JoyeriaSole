/**
 * Las fotos las sirve nuestra propia API (`/api/...`, mismo origen). Si alguna vez llegara otra
 * URL (esquema distinto, otro dominio, protocolo relativo `//`), no se carga en la interfaz.
 */
export function isSafePhotoUrl(url: string): boolean {
  return url.startsWith('/api/');
}

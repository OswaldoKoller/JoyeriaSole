/** URL del logo vigente; `v` es su huella (SHA-256), así un logo nuevo no se confunde con el viejo. */
export function logoUrl(sha256: string): string {
  return `/api/v1/settings/business/logo?v=${sha256}`;
}

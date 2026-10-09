import { createHash, randomBytes } from 'node:crypto';

/** Token de sesión opaco: 256 bits de entropía, apto para cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** En base de datos solo se guarda el hash: una filtración de la BD no permite secuestrar sesiones. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

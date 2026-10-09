import { hash, verify } from '@node-rs/argon2';

// Argon2id (algoritmo por defecto de @node-rs/argon2) con parámetros recomendados por OWASP.
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    // Hash corrupto o con formato desconocido: se trata como contraseña incorrecta.
    return false;
  }
}

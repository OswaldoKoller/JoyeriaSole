import { ERROR_CODES } from '@joyeria/shared';
import { useState } from 'react';
import { ApiError } from './api-client.ts';

/**
 * Claves `Idempotency-Key` para operaciones críticas (ver docs/api/API.md «Idempotencia»).
 *
 * Una clave por INTENTO de operación del usuario: se reutiliza en los reintentos (doble clic, error
 * de red, 503) mientras los datos de la operación no cambien, y se descarta al terminar con éxito o
 * si el servidor responde que la clave ya se usó con otros datos (409 IDEMPOTENCY_KEY_REUSED).
 */

/**
 * UUID v4 nuevo. `crypto.randomUUID` solo existe en contextos seguros (HTTPS o localhost); en una
 * red local por HTTP se arma con `crypto.getRandomValues`, que sí está disponible.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // versión 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface AttemptKeys {
  /** Clave del intento en curso para estos datos (la misma mientras no cambien). */
  keyFor: (variables: unknown) => string;
  /** Cierra el intento según el resultado: éxito o clave rechazada → la próxima vez, clave nueva. */
  settle: (error: unknown) => void;
}

export function createAttemptKeys(generate: () => string = newIdempotencyKey): AttemptKeys {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(variables) {
      const fingerprint = JSON.stringify(variables ?? null);
      if (current?.fingerprint !== fingerprint) current = { fingerprint, key: generate() };
      return current.key;
    },
    settle(error) {
      const keyRejected =
        error instanceof ApiError && error.code === ERROR_CODES.IDEMPOTENCY_KEY_REUSED;
      if (!error || keyRejected) current = null;
    },
  };
}

/** Claves de intento estables durante la vida del componente que usa la mutación. */
export function useAttemptKeys(): AttemptKeys {
  const [keys] = useState(() => createAttemptKeys());
  return keys;
}

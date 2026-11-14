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

export interface ReadAttempt {
  key: string;
  /** Cierra la lectura: sin error se olvida la clave; con error se conserva para repetirla. */
  done: (error: unknown) => void;
}

export interface RetryKeys {
  /** Inicia una lectura: clave nueva, o la de la misma lectura si la anterior falló. */
  begin: (variables: unknown) => ReadAttempt;
}

/**
 * Claves para operaciones que se repiten A PROPÓSITO con los mismos datos y pueden dispararse en
 * paralelo (cada lectura del lector de códigos es una pieza más). A diferencia de
 * `createAttemptKeys`, la clave NO se comparte entre lecturas simultáneas: solo se reutiliza cuando
 * la lectura anterior con los mismos datos terminó en error (resultado desconocido), de modo que
 * reintentarla no suma dos veces; al tener éxito se olvida y la siguiente lectura usa otra clave.
 */
export function createRetryKeys(generate: () => string = newIdempotencyKey): RetryKeys {
  let failed: { fingerprint: string; key: string } | null = null;
  return {
    begin(variables) {
      const fingerprint = JSON.stringify(variables ?? null);
      const key = failed?.fingerprint === fingerprint ? failed.key : generate();
      return {
        key,
        done(error) {
          const keyRejected =
            error instanceof ApiError && error.code === ERROR_CODES.IDEMPOTENCY_KEY_REUSED;
          if (error && !keyRejected) failed = { fingerprint, key };
          else if (failed?.key === key || keyRejected) failed = null;
        },
      };
    },
  };
}

export function useRetryKeys(): RetryKeys {
  const [keys] = useState(() => createRetryKeys());
  return keys;
}

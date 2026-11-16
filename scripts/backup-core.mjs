// Núcleo PURO del respaldo automático (sin Docker ni red): nombres de archivo, retención,
// cifrado opcional y lectura de .env. Lo usa `scripts/backup.mjs` y lo prueban
// `apps/api/test/unit/backup-core.test.ts`.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  openSync,
  readSync,
  closeSync,
  statSync,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';

/** Prefijo y extensiones de los archivos de respaldo (lo único que el script toca al limpiar). */
export const BACKUP_PREFIX = 'joyeria-';
export const DUMP_EXTENSION = '.dump';
export const ENCRYPTED_EXTENSION = '.dump.enc';
const NAME_PATTERN = /^joyeria-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump(\.enc)?$/;

const pad = (value) => String(value).padStart(2, '0');

/** Fecha local como `AAAAMMDD-HHmmss` (la hora de la tienda, no UTC). */
export function timestampOf(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** `joyeria-20261114-203000.dump` (o `.dump.enc` si va cifrado). */
export function backupFileName(date, encrypted) {
  return `${BACKUP_PREFIX}${timestampOf(date)}${encrypted ? ENCRYPTED_EXTENSION : DUMP_EXTENSION}`;
}

/** Subcarpeta por año y mes: `2026/11`. */
export function monthFolder(date) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}`;
}

/** Interpreta el nombre de un respaldo; `null` si no es uno de los nuestros. */
export function parseBackupName(name) {
  const match = NAME_PATTERN.exec(name);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, encrypted] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return {
    name,
    date,
    encrypted: Boolean(encrypted),
    month: `${year}-${month}`,
    day: `${year}-${month}-${day}`,
  };
}

/**
 * Qué respaldos conservar: el ÚLTIMO de cada uno de los `keepDaily` días más recientes con respaldo
 * y el ÚLTIMO de cada uno de los `keepMonthly` meses más recientes. Todo lo demás se puede borrar.
 * Nunca devuelve para borrar el respaldo más reciente, aunque la configuración sea absurda.
 * `names`: nombres de archivo (los que no son nuestros se ignoran). Devuelve `{ keep, remove }`.
 */
export function planRetention(names, { keepDaily, keepMonthly }) {
  const parsed = names
    .map(parseBackupName)
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
  const keep = new Set();
  const lastOfDay = new Map();
  const lastOfMonth = new Map();
  for (const item of parsed) {
    lastOfDay.set(item.day, item);
    lastOfMonth.set(item.month, item);
  }
  const days = [...lastOfDay.keys()].sort().slice(-Math.max(keepDaily, 1));
  const months = keepMonthly > 0 ? [...lastOfMonth.keys()].sort().slice(-keepMonthly) : [];
  for (const day of days) keep.add(lastOfDay.get(day).name);
  for (const month of months) keep.add(lastOfMonth.get(month).name);
  const newest = parsed.at(-1);
  if (newest) keep.add(newest.name);
  return {
    keep: parsed.filter((item) => keep.has(item.name)).map((item) => item.name),
    remove: parsed.filter((item) => !keep.has(item.name)).map((item) => item.name),
  };
}

/** Lee un entero positivo de una variable de entorno; si no es válido, usa el valor por defecto. */
export function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Lee `CLAVE=valor` de un .env (sin imprimir ni validar secretos). */
export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] && !line.trimStart().startsWith('#')) {
      values[match[1]] = (match[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}

// ---------------------------------------------------------------------------------------------
// Cifrado opcional: AES-256-GCM con clave derivada de la frase (scrypt). Formato del archivo:
//   «JSBK1» (5) · sal (16) · IV (12) · texto cifrado · etiqueta GCM (16)
// La etiqueta autentica TODO el contenido: un archivo alterado o una frase equivocada no descifra.
// ---------------------------------------------------------------------------------------------

const MAGIC = Buffer.from('JSBK1');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

/** Cifra `source` en `target` (archivos). La frase debe tener al menos 12 caracteres. */
export async function encryptFile(source, target, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new Error('La frase de cifrado debe tener al menos 12 caracteres.');
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const out = createWriteStream(target, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(source), cipher, out, { end: false });
  out.end(cipher.getAuthTag());
  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

/** Descifra `source` en `target`. Falla si la frase es incorrecta o el archivo fue alterado. */
export async function decryptFile(source, target, passphrase) {
  const size = statSync(source).size;
  if (size < HEADER_BYTES + TAG_BYTES) throw new Error('El archivo cifrado está incompleto.');
  const fd = openSync(source, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    readSync(fd, header, 0, HEADER_BYTES, 0);
    readSync(fd, tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    closeSync(fd);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('El archivo no es un respaldo cifrado de Joyería Sole.');
  }
  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = header.subarray(MAGIC.length + SALT_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(source, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(target, { mode: 0o600 }),
    );
  } catch {
    throw new Error('No se pudo descifrar: la frase es incorrecta o el archivo está dañado.');
  }
}

/** Tipos del núcleo puro del respaldo (`scripts/backup-core.mjs`), para sus pruebas. */
export const BACKUP_PREFIX: string;
export const DUMP_EXTENSION: string;
export const ENCRYPTED_EXTENSION: string;
export function timestampOf(date: Date): string;
export function backupFileName(date: Date, encrypted: boolean): string;
export function monthFolder(date: Date): string;
export function parseBackupName(
  name: string,
): { name: string; date: Date; encrypted: boolean; month: string; day: string } | null;
export function planRetention(
  names: readonly string[],
  options: { keepDaily: number; keepMonthly: number },
): { keep: string[]; remove: string[] };
export function positiveInt(value: unknown, fallback: number): number;
export function parseEnv(text: string): Record<string, string>;
export function encryptFile(source: string, target: string, passphrase: string): Promise<void>;
export function decryptFile(source: string, target: string, passphrase: string): Promise<void>;

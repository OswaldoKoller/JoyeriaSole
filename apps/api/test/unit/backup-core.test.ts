/**
 * Núcleo puro del respaldo automático (`scripts/backup-core.mjs`): nombres, retención y cifrado.
 * No usa Docker: el flujo completo con PostgreSQL se prueba aparte (ver docs/deployment/BACKUPS.md).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupFileName,
  decryptFile,
  encryptFile,
  monthFolder,
  parseBackupName,
  parseEnv,
  planRetention,
  positiveInt,
} from '../../../../scripts/backup-core.mjs';

const at = (iso: string) => new Date(iso);

describe('nombres de los respaldos', () => {
  it('usa la fecha y hora locales y distingue el cifrado', () => {
    const date = new Date(2026, 10, 14, 20, 5, 9);
    expect(backupFileName(date, false)).toBe('joyeria-20261114-200509.dump');
    expect(backupFileName(date, true)).toBe('joyeria-20261114-200509.dump.enc');
    expect(monthFolder(date)).toBe('2026/11');
  });

  it('interpreta solo los nombres propios', () => {
    expect(parseBackupName('joyeria-20261114-200509.dump.enc')).toMatchObject({
      encrypted: true,
      day: '2026-11-14',
      month: '2026-11',
    });
    for (const other of ['notas.txt', 'joyeria-2026.dump', 'joyeria-20261114-200509.dump.json']) {
      expect(parseBackupName(other)).toBeNull();
    }
  });
});

describe('retención', () => {
  const day = (n: number, hour = 20) => backupFileName(new Date(2026, 10, n, hour, 0, 0), false);

  it('conserva el último respaldo de cada día reciente y borra los demás del mismo día', () => {
    const names = [day(10, 8), day(10, 20), day(11, 20), day(12, 20), day(13, 20)];
    const { keep, remove } = planRetention(names, { keepDaily: 2, keepMonthly: 0 });
    expect(keep).toEqual([day(12, 20), day(13, 20)]);
    expect(remove).toEqual([day(10, 8), day(10, 20), day(11, 20)]);
  });

  it('conserva además el último de cada mes reciente', () => {
    const names = [
      backupFileName(new Date(2026, 8, 30, 20, 0, 0), false),
      backupFileName(new Date(2026, 9, 31, 20, 0, 0), false),
      backupFileName(new Date(2026, 10, 14, 20, 0, 0), false),
      backupFileName(new Date(2026, 10, 15, 20, 0, 0), false),
    ];
    const { keep } = planRetention(names, { keepDaily: 1, keepMonthly: 3 });
    expect(keep).toEqual([names[0], names[1], names[3]]);
  });

  it('nunca borra el más reciente ni toca archivos ajenos', () => {
    const names = [day(1), day(2), 'importante.docx', 'joyeria-20261114-200509.dump.json'];
    const { keep, remove } = planRetention(names, { keepDaily: 0, keepMonthly: 0 });
    expect(keep).toEqual([day(2)]);
    expect(remove).toEqual([day(1)]);
    expect([...keep, ...remove]).not.toContain('importante.docx');
  });

  it('sin respaldos no hay nada que hacer', () => {
    expect(planRetention([], { keepDaily: 14, keepMonthly: 12 })).toEqual({ keep: [], remove: [] });
  });

  it('lee enteros de configuración con valor por defecto', () => {
    expect(positiveInt('7', 14)).toBe(7);
    expect(positiveInt(undefined, 14)).toBe(14);
    expect(positiveInt('-3', 14)).toBe(14);
    expect(positiveInt('abc', 14)).toBe(14);
    expect(at('2026-11-14T00:00:00Z')).toBeInstanceOf(Date);
  });

  it('lee el .env sin comentarios ni comillas', () => {
    expect(
      parseEnv(
        '# x\nBACKUP_DIR="D:\\respaldos"\nPOSTGRES_USER=joyeria\n  BACKUP_KEEP_DAILY = 5 \n',
      ),
    ).toEqual({
      BACKUP_DIR: 'D:\\respaldos',
      POSTGRES_USER: 'joyeria',
      BACKUP_KEEP_DAILY: '5',
    });
  });
});

// scrypt es costoso a propósito: en una PC lenta o saturada cada derivación puede tardar segundos.
describe('cifrado de respaldos', { timeout: 60_000 }, () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'joyeria-backup-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const PASSPHRASE = 'frase-de-prueba-larga-1234';

  it('descifra exactamente lo que cifró y el archivo cifrado no contiene el original', async () => {
    const plain = path.join(dir, 'a.dump');
    const secret = Buffer.concat([
      Buffer.from('PGDMP datos-secretos-de-la-tienda '),
      Buffer.alloc(200_000, 7),
    ]);
    writeFileSync(plain, secret);
    await encryptFile(plain, path.join(dir, 'a.dump.enc'), PASSPHRASE);
    const encrypted = readFileSync(path.join(dir, 'a.dump.enc'));
    expect(encrypted.includes(Buffer.from('datos-secretos'))).toBe(false);
    await decryptFile(path.join(dir, 'a.dump.enc'), path.join(dir, 'b.dump'), PASSPHRASE);
    expect(readFileSync(path.join(dir, 'b.dump')).equals(secret)).toBe(true);
  });

  it('una frase equivocada o un archivo alterado no descifran', async () => {
    const plain = path.join(dir, 'a.dump');
    writeFileSync(plain, Buffer.alloc(50_000, 3));
    const encryptedPath = path.join(dir, 'a.dump.enc');
    await encryptFile(plain, encryptedPath, PASSPHRASE);
    await expect(
      decryptFile(encryptedPath, path.join(dir, 'x.dump'), 'otra-frase-distinta-9999'),
    ).rejects.toThrow(/frase es incorrecta|dañado/);

    const tampered = readFileSync(encryptedPath);
    tampered[100] = (tampered[100] ?? 0) ^ 0xff;
    writeFileSync(encryptedPath, tampered);
    await expect(decryptFile(encryptedPath, path.join(dir, 'y.dump'), PASSPHRASE)).rejects.toThrow(
      /frase es incorrecta|dañado/,
    );
  });

  it('exige una frase de al menos 12 caracteres y rechaza archivos que no son respaldos', async () => {
    const plain = path.join(dir, 'a.dump');
    writeFileSync(plain, 'x');
    await expect(encryptFile(plain, path.join(dir, 'c.enc'), 'corta')).rejects.toThrow(
      /12 caracteres/,
    );
    writeFileSync(path.join(dir, 'raro.enc'), Buffer.alloc(100, 1));
    await expect(
      decryptFile(path.join(dir, 'raro.enc'), path.join(dir, 'd.dump'), PASSPHRASE),
    ).rejects.toThrow(/no es un respaldo/);
  });
});

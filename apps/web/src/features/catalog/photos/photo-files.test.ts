import { describe, expect, it } from 'vitest';
import { formatBytes, validatePhotoFile } from './photo-files.ts';

const file = (type: string, size: number, name = 'foto.jpg') => ({ type, size, name });

describe('validatePhotoFile', () => {
  it('acepta JPG, PNG y WebP dentro del límite', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validatePhotoFile(file(type, 1024))).toBeNull();
    }
  });

  it('rechaza otros formatos, archivos vacíos y los que superan 5 MB', () => {
    expect(validatePhotoFile(file('image/gif', 10, 'a.gif'))).toMatch(/no es una foto/);
    expect(validatePhotoFile(file('image/svg+xml', 10))).toMatch(/no es una foto/);
    expect(validatePhotoFile(file('image/jpeg', 0))).toMatch(/vacío/);
    expect(validatePhotoFile(file('image/jpeg', 5 * 1024 * 1024 + 1))).toMatch(/5 MB/);
    expect(validatePhotoFile(file('image/jpeg', 5 * 1024 * 1024))).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formatea KB y MB', () => {
    expect(formatBytes(100)).toBe('1 KB');
    expect(formatBytes(84 * 1024)).toBe('84 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 MB');
  });
});

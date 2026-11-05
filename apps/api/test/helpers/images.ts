import sharp from 'sharp';

export type TestImageFormat = 'jpeg' | 'png' | 'webp';

/** Genera una imagen sintética pequeña de color liso (sin binarios en el repositorio). */
export async function makeImage(
  format: TestImageFormat = 'jpeg',
  width = 400,
  height = 300,
  options: { withExif?: boolean; color?: string } = {},
) {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: options.color ?? '#b8860b' },
  });
  if (options.withExif) {
    pipeline = pipeline.withMetadata({
      exif: { IFD0: { Copyright: 'Joyería de prueba', Artist: 'Secreto' } },
    });
  }
  return pipeline[format]().toBuffer();
}

/** Cuerpo multipart/form-data con un archivo (y campos extra opcionales) para `app.inject`. */
export function multipartPayload(
  file: { name: string; type: string; bytes: Uint8Array } | null,
  options: { fieldName?: string; extraFields?: Record<string, string> } = {},
) {
  const boundary = '----joyeria-test-boundary';
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(options.extraFields ?? {})) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${options.fieldName ?? 'file'}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      Buffer.from(file.bytes),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

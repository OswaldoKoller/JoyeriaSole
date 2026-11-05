import { MAX_PHOTOS_PER_PRODUCT, type ProductPhoto } from '@joyeria/shared';
import { useId, useState, type DragEvent } from 'react';
import { PHOTO_ACCEPT, validatePhotoFile } from './photo-files.ts';
import { useUploadProductPhoto } from './use-product-photos.ts';

type Props = {
  /** Producto ya creado al que se adjuntan las fotos. */
  productId: string;
  productName: string;
  /** Fotos que el producto ya tiene (el máximo es 5). */
  photoCount: number;
  disabled?: boolean;
  /** Se llama tras cada foto subida (p. ej. el alta rápida de un ingreso guarda su id). */
  onUploaded?: (photo: ProductPhoto) => void;
};

/**
 * Subida de fotos reutilizable: elegir archivos o arrastrarlos. No decide dónde se muestra la
 * galería; solo sube, informa el avance y los errores en español. Uso en el alta rápida de piezas
 * de un ingreso: crear el producto y, con su `id`, renderizar `<PhotoUploader productId=... />`
 * (o llamar a `useUploadProductPhoto`).
 */
export function PhotoUploader({
  productId,
  productName,
  photoCount,
  disabled = false,
  onUploaded,
}: Props) {
  const upload = useUploadProductPhoto();
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remaining = MAX_PHOTOS_PER_PRODUCT - photoCount;
  const full = remaining <= 0;
  const blocked = disabled || full || progress !== null;

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0 || blocked) return;
    setError(null);
    const selected = files.slice(0, remaining);
    const skipped = files.length - selected.length;
    let failure: string | null = null;
    for (const [index, file] of selected.entries()) {
      const problem = validatePhotoFile(file);
      if (problem) {
        failure = problem;
        break;
      }
      setProgress(`Subiendo foto ${index + 1} de ${selected.length}…`);
      try {
        const response = await upload.mutateAsync({ productId, file });
        onUploaded?.(response.data);
      } catch (cause) {
        failure = cause instanceof Error ? cause.message : 'No se pudo subir la foto.';
        break;
      }
    }
    setProgress(null);
    if (failure) setError(failure);
    else if (skipped > 0) {
      setError(
        `Solo caben ${MAX_PHOTOS_PER_PRODUCT} fotos por producto: se omitieron ${skipped} archivo(s).`,
      );
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!blocked) setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
      className={`rounded-lg border border-dashed p-3 text-sm ${
        dragging ? 'border-brand-500 bg-brand-50' : 'border-stone-300'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium text-stone-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500 ${
            blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-stone-100'
          }`}
        >
          Subir foto<span className="sr-only"> de {productName}</span>
          <input
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            className="sr-only"
            disabled={blocked}
            aria-describedby={hintId}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = ''; // permite volver a elegir el mismo archivo
              void handleFiles(files);
            }}
          />
        </label>
        <p id={hintId} className="text-xs text-stone-600">
          {full
            ? `Este producto ya tiene ${MAX_PHOTOS_PER_PRODUCT} fotos (el máximo). Elimine una para subir otra.`
            : `JPG, PNG o WebP, hasta 5 MB. Puede arrastrar las fotos aquí. Caben ${remaining} más.`}
        </p>
      </div>
      {progress && (
        <p role="status" className="mt-2 text-stone-700">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

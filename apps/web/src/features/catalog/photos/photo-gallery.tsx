import type { Product } from '@joyeria/shared';
import { useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { formatBytes } from './photo-files.ts';
import { isSafePhotoUrl } from './photo-url.ts';
import { PhotoUploader } from './photo-uploader.tsx';
import { useDeletePhoto, useReorderPhotos, useSetCoverPhoto } from './use-product-photos.ts';

type Props = { product: Product; canManage: boolean };

/** Galería de la ficha: vista previa de las fotos; con permiso, subir, portada, orden y baja. */
export function PhotoGallery({ product, canManage }: Props) {
  const setCover = useSetCoverPhoto();
  const reorder = useReorderPhotos();
  const remove = useDeletePhoto();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Solo se muestran fotos servidas por nuestra API (S-01).
  const photos = product.photos.filter((photo) => isSafePhotoUrl(photo.url));
  const busy = setCover.isPending || reorder.isPending || remove.isPending;

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    }
  }

  function move(index: number, delta: -1 | 1) {
    const ids = photos.map((photo) => photo.id);
    const moved = ids[index];
    const other = ids[index + delta];
    if (moved === undefined || other === undefined) return;
    ids[index] = other;
    ids[index + delta] = moved;
    void run(
      () => reorder.mutateAsync({ productId: product.id, photoIds: ids }),
      'No se pudo cambiar el orden.',
    );
  }

  return (
    <section
      aria-label={`Fotos de ${product.name}`}
      className="mt-3 space-y-3 rounded-lg bg-stone-50 p-3"
    >
      {photos.length === 0 && (
        <p className="text-sm text-stone-600">Este producto todavía no tiene fotos.</p>
      )}
      {photos.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => {
            const label = `foto ${index + 1} de ${product.name}`;
            return (
              <li
                key={photo.id}
                className="space-y-2 rounded-lg border border-stone-200 bg-white p-2"
              >
                <img
                  src={photo.url}
                  alt={`Foto ${index + 1} de ${product.name}`}
                  width={photo.width}
                  height={photo.height}
                  loading="lazy"
                  className="aspect-square w-full rounded-md bg-stone-100 object-contain"
                />
                <p className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                  <span>
                    {photo.width} × {photo.height} px · {formatBytes(photo.sizeBytes)}
                  </span>
                  {photo.isCover && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-800">
                      Portada
                    </span>
                  )}
                </p>
                {canManage && (
                  <div className="flex flex-wrap gap-1">
                    {!photo.isCover && (
                      <Button
                        variant="secondary"
                        className="min-h-9 px-2 text-xs"
                        disabled={busy}
                        aria-label={`Marcar como portada la ${label}`}
                        onClick={() =>
                          void run(
                            () =>
                              setCover.mutateAsync({ productId: product.id, photoId: photo.id }),
                            'No se pudo marcar la portada.',
                          )
                        }
                      >
                        Marcar portada
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      className="min-h-9 px-2 text-xs"
                      disabled={busy || index === 0}
                      aria-label={`Mover antes la ${label}`}
                      onClick={() => {
                        move(index, -1);
                      }}
                    >
                      ← Antes
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-9 px-2 text-xs"
                      disabled={busy || index === photos.length - 1}
                      aria-label={`Mover después la ${label}`}
                      onClick={() => {
                        move(index, 1);
                      }}
                    >
                      Después →
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-9 border-red-300 px-2 text-xs text-red-700"
                      disabled={busy}
                      aria-label={`Eliminar la ${label}`}
                      onClick={() => {
                        setConfirming(photo.id);
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                )}
                {canManage && confirming === photo.id && (
                  <div
                    role="alertdialog"
                    aria-label={`Confirmar eliminación de la ${label}`}
                    className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900"
                  >
                    <p>
                      ¿Eliminar esta foto?
                      {photo.isCover && photos.length > 1
                        ? ' La siguiente pasará a ser la portada.'
                        : ''}{' '}
                      No se puede deshacer.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        className="min-h-9 px-2 text-xs"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(null);
                          void run(
                            () => remove.mutateAsync({ productId: product.id, photoId: photo.id }),
                            'No se pudo eliminar la foto.',
                          );
                        }}
                      >
                        Sí, eliminar foto
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-9 px-2 text-xs"
                        onClick={() => {
                          setConfirming(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {canManage && (
        <PhotoUploader
          productId={product.id}
          productName={product.name}
          photoCount={photos.length}
        />
      )}
    </section>
  );
}

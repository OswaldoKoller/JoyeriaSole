import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/button.tsx';
import { apiDownload } from '../../lib/api-client.ts';

/** Entrega el archivo al navegador sin abrir otra pestaña (enlace temporal con `download`). */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface ExportCsvButtonProps {
  /** Ruta de la API (sin el prefijo `/api/v1`) con los filtros activos en la consulta. */
  path: string;
  /** Qué se exporta, para el mensaje de error y el nombre accesible. */
  subject: string;
  /** Aviso corto bajo el botón (p. ej. que incluye costos). */
  hint?: string;
}

/**
 * «Exportar CSV»: descarga con la cookie de sesión lo que muestra la pantalla (mismos filtros). Se
 * deshabilita mientras prepara el archivo y anuncia el resultado a los lectores de pantalla.
 */
export function ExportCsvButton({ path, subject, hint }: ExportCsvButtonProps) {
  const download = useMutation({
    mutationFn: () => apiDownload(path),
    onSuccess: ({ blob, filename }) => {
      saveFile(blob, filename);
    },
  });

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        disabled={download.isPending}
        aria-busy={download.isPending}
        onClick={() => {
          download.mutate();
        }}
      >
        {download.isPending ? 'Preparando archivo…' : 'Exportar CSV'}
      </Button>
      {hint && <p className="max-w-60 text-xs text-stone-500">{hint}</p>}
      <div role="status" aria-live="polite" className="text-xs text-stone-600">
        {download.isSuccess ? 'Archivo descargado.' : ''}
      </div>
      {download.isError && (
        <p role="alert" className="max-w-60 text-xs text-red-700">
          No se pudo exportar {subject}: {download.error.message}
        </p>
      )}
    </div>
  );
}

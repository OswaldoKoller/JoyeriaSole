import { useEffect } from 'react';

const APP_NAME = 'Joyería Sole';

/** Título de la pestaña por pantalla («Productos · Joyería Sole»): orienta a lectores de pantalla. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}

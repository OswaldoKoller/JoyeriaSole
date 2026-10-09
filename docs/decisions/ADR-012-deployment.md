# ADR-012: Despliegue en un solo servicio + Docker

- **Estado:** Aceptado (proveedor PENDIENTE P-18; recomendado Render)
- **Fecha:** 2026-10-06

## Decisión

- **Producción:** una imagen Docker con la API y el frontend compilado; la API sirve la SPA (mismo
  origen → sin CORS, cookies SameSite=Strict). Al arrancar ejecuta `prisma migrate deploy`.
  PostgreSQL **administrado**, fuera del contenedor.
- **Desarrollo:** Docker solo para PostgreSQL (`npm run db:up`); API y web corren en el host con
  recarga en caliente. Docker aporta la misma versión de BD que producción, aislamiento de las
  instalaciones locales de Postgres y la base de pruebas creada automáticamente.
- La imagen es portable entre Render, Railway o un VPS.

## Alternativas consideradas

- Frontend en Vercel/Cloudflare Pages + API aparte: dos orígenes, cookies cross-site, CORS, más piezas.
- Todo en Docker en desarrollo: recarga más lenta y depuración más incómoda sin beneficio real.
- Sin Docker en producción: dependería del runtime de cada plataforma (menos portable).

## Consecuencias

Recomendación y evaluación de plataformas en `docs/deployment/DEPLOYMENT.md`.

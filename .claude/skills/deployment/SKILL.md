---
name: deployment
description: Despliegue de Joyería Sole — imagen Docker única (API + SPA), variables de producción, migraciones al arrancar, CI de GitHub Actions, hosting recomendado (Render) y backups. Usar al tocar Dockerfile, docker-compose, workflows o configuración de producción.
---

# Despliegue

Referencias: `docs/deployment/DEPLOYMENT.md`, `docs/deployment/BACKUPS.md`, ADR-012.

## Piezas

| Archivo                    | Rol                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`               | Multi-stage: deps → build (tsup + vite) → prod-deps → runtime Alpine no-root. `CMD`: `prisma migrate deploy && node dist/server.js` |
| `docker-compose.yml`       | Dev: solo `db` (PostgreSQL 18, puerto 5434). Perfil `prod`: prueba local de la imagen en :8080                                      |
| `scripts/db-init/`         | Crea `joyeria_test` al inicializar el volumen                                                                                       |
| `.github/workflows/ci.yml` | lint · formato · tipos · migraciones desde cero · tests · build · imagen                                                            |

## Variables de producción

`NODE_ENV=production`, `DATABASE_URL`, `AUTH_SECRET` (nuevo, ≥ 48 bytes), `CORS_ORIGIN` y
`FRONTEND_URL` (dominio https), `TRUST_PROXY=true` detrás del proxy del hosting, `LOG_LEVEL=info`.
`PORT` lo inyecta el hosting (la API lo usa si no hay `API_PORT`). `WEB_DIST_DIR` ya viene en la imagen.
`COOKIE_SECURE` nunca en `false` en producción real.

## Verificaciones antes de cambiar infraestructura

```bash
docker build -t joyeria-sole:local .
docker compose --profile prod up --build      # http://localhost:8080 → login funciona
curl -f http://localhost:8080/api/v1/health
```

## Reglas

- No desplegar, crear servicios ni tocar cuentas externas sin confirmación del usuario.
- Secretos solo en GitHub Secrets / panel del hosting.
- Migraciones siempre hacia adelante; `migrate deploy` es la única operación de esquema en producción.
- Mantener la imagen sin dependencias de desarrollo y con `USER node`.
- Antes de una migración riesgosa en producción: dump manual (BACKUPS.md, capa 3).

## Pendiente

Proveedor final (P-18), job de backups externos, dominio, staging, monitoreo/alertas.

# Despliegue

## Arquitectura de producción

```
Usuario ─HTTPS─► Hosting (TLS automático, dominio propio)
                   └─► Contenedor: API Fastify + SPA compilada (un servicio, mismo origen)
                          └─TLS─► PostgreSQL administrado (backups diarios + PITR)
                                     └─► pg_dump diario cifrado → almacenamiento externo (R2/S3)
```

**Un solo servicio** sirve API y frontend: sin CORS, cookies `SameSite=Strict` funcionando, un único
certificado y menor costo. El frontend es estático, así que no hay penalización de rendimiento.

## Evaluación de plataformas

| Opción                                               | Costo aprox./mes*  | Facilidad                                         | Seguridad / HTTPS              | Backups BD                              | Escala            | Comentario                                                       |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------- | ------------------------------ | --------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| **Render** (Web Service Docker + Render Postgres)    | ~US$7 + ~US$20     | Alta: deploy desde GitHub, variables en panel     | TLS automático, dominio propio | Diarios + PITR en planes pagos          | Vertical sencilla | **Recomendado**                                                  |
| Railway (servicio + Postgres)                        | Por uso, ~US$10–25 | Alta                                              | TLS automático                 | Backups según plan; verificar retención | Buena             | Buena alternativa; costo menos predecible                        |
| Supabase (solo como BD) + Render/Railway para la app | US$0–25 + app      | Media                                             | Buena                          | PITR en plan Pro                        | Buena             | Útil si se quisieran sus extras; aquí no se usan                 |
| Vercel                                               | —                  | Alta para frontends                               | —                              | No incluye BD propia                    | —                 | No adecuado para una API Fastify con estado; descartado          |
| Cloudflare                                           | —                  | —                                                 | —                              | —                                       | —                 | Excelente como DNS/CDN/R2 (backups), no como host de la API Node |
| VPS (Hetzner/DigitalOcean) + Docker Compose + Caddy  | ~US$5–12           | Baja: administrar SO, parches, backups, monitoreo | Depende del equipo             | **Propios**                             | Manual            | Más barato, pero traslada responsabilidad operativa a la pyme    |

\* Precios orientativos a verificar al contratar (P-18).

### Recomendación

**Render**: Web Service (Docker, este `Dockerfile`) + **Render PostgreSQL** en plan pago con
backups/PITR, **Cloudflare** como DNS del dominio y **Cloudflare R2** para la copia externa de
backups. Motivos: despliegue automático desde GitHub, HTTPS y dominio sin configuración, base
administrada con recuperación a un punto en el tiempo, costo predecible y ninguna administración de
servidores. La imagen Docker es portable: migrar a Railway o a un VPS no requiere cambios de código.

## Variables de entorno de producción

| Variable                      | Valor                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `production`                                                                    |
| `DATABASE_URL`                | URL interna de la BD administrada, con `sslmode=require` si es externa          |
| `AUTH_SECRET`                 | Aleatorio ≥ 48 bytes, **distinto** al de desarrollo                             |
| `CORS_ORIGIN`, `FRONTEND_URL` | `https://inventario.<dominio>`                                                  |
| `TRUST_PROXY`                 | `true` (Render/Railway ponen un proxy delante)                                  |
| `LOG_LEVEL`                   | `info`                                                                          |
| `SESSION_TTL_HOURS`           | `3` (política aprobada P-19)                                                    |
| `API_PORT`                    | No definir: la API usa `PORT` si el hosting lo inyecta (Render/Railway), o 3000 |

`COOKIE_SECURE` no se define (por defecto `true` en producción). `SEED_ADMIN_*` solo se definen
temporalmente para el primer seed y luego se eliminan.

## Primer despliegue (paso a paso)

1. Crear repositorio en GitHub y subir `main` y `develop`.
2. Crear la base PostgreSQL administrada (región más cercana a Bolivia disponible, p. ej. US East).
3. Crear el Web Service desde el repo con runtime Docker; health check en `/api/v1/health`.
4. Cargar las variables de entorno de la tabla anterior.
5. Deploy: el contenedor ejecuta `prisma migrate deploy` y arranca.
6. Ejecutar el seed una vez (shell del servicio): `npx prisma db seed` con `SEED_ADMIN_*` definidos;
   luego borrar esas variables.
7. Configurar dominio propio en el hosting y registro CNAME en Cloudflare → HTTPS automático.
8. Ingresar, **cambiar la contraseña del administrador** y crear los usuarios reales.
9. Configurar backups externos (ver [BACKUPS.md](BACKUPS.md)) y probar una restauración.

## Flujo continuo

```
feature/* ─PR─► develop ─(CI verde)─► PR develop → main ─(CI verde + revisión)─► merge
   └─► Render auto-deploy de main → migrate deploy → health check → tráfico al nuevo contenedor
```

- Opcional: un servicio de _staging_ que despliegue `develop` con su propia BD.
- Rollback: re-desplegar el commit anterior desde el panel. Las migraciones son hacia adelante; si
  una migración requiere reversión se crea otra migración correctiva.

## Probar la imagen de producción en local

```bash
docker compose --profile prod up --build     # http://localhost:8080
```

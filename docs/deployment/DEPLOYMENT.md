# Despliegue

> **Estado: despliegue pendiente.** Aún no se eligió hosting ni dominio (P-18) y el flujo de CI
> (`.github/workflows/ci.yml`) solo verifica calidad, ejecuta los E2E y construye la imagen Docker; el paso de
> despliegue está comentado como pendiente. Este documento contiene la recomendación y el procedimiento
> **previstos**. Para probar la aplicación sin hosting, usar el [despliegue local](LOCAL.md).

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

| Variable                      | Valor                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `production`                                                                                                                                                        |
| `DATABASE_URL`                | URL interna de la BD administrada, con `sslmode=require` si es externa                                                                                              |
| `AUTH_SECRET`                 | Aleatorio ≥ 48 bytes, **distinto** al de desarrollo                                                                                                                 |
| `CORS_ORIGIN`, `FRONTEND_URL` | `https://inventario.<dominio>`                                                                                                                                      |
| `TRUST_PROXY_HOPS`            | `1` si hay UN proxy/balanceador propio delante (Render/Railway); `0` (por defecto) si la API recibe tráfico directo. Con Cloudflare delante de Render suele ser `2` |
| `LOG_LEVEL`                   | `info`                                                                                                                                                              |
| `SESSION_TTL_HOURS`           | `8` (sesión fija; política P-19 actualizada el 2026-11-05)                                                                                                          |
| `API_PORT`                    | No definir: la API usa `PORT` si el hosting lo inyecta (Render/Railway), o 3000                                                                                     |

`COOKIE_SECURE` no se define (por defecto `true` en producción; con `false` en producción la API
registra un aviso al arrancar). `SEED_ADMIN_*` solo se definen temporalmente para el primer seed y luego
se eliminan.

**`TRUST_PROXY_HOPS` (ruptura de compatibilidad).** Reemplaza al booleano `TRUST_PROXY`, que confiaba en
toda la cadena `X-Forwarded-For` y dejaba a un atacante falsear su IP para evadir el límite de intentos de
login. Ahora se indica **cuántos proxies propios** hay delante de la API y solo se acepta ese número de
saltos contados desde el final de la cabecera. Si el entorno todavía define `TRUST_PROXY=true`, la API
**no arranca** y muestra cómo migrar. Cómo fijarlo: dejar `0`, desplegar, enviar una petición con
`X-Forwarded-For: 1.2.3.4` y comprobar en los logs de la API qué IP se registra; subir el valor de a uno
hasta que se vea la IP real del cliente (nunca más alto de lo necesario: un valor excesivo vuelve a permitir
falsear la IP). Los health checks del hosting no deben superar 60 peticiones por minuto (límite de `/health`).

La imagen elimina los mapas de código (`.map`) y arranca la API con `exec node` (la señal `SIGTERM` del
hosting llega a Node para un apagado ordenado). En desarrollo, `docker-compose.yml` publica PostgreSQL solo
en `127.0.0.1`.

## Extensiones de PostgreSQL (pg_trgm)

La migración `20261106040000_performance_indexes` ejecuta `CREATE EXTENSION IF NOT EXISTS pg_trgm`
(índices de trigramas para las búsquedas con `ILIKE '%texto%'`). `pg_trgm` es una extensión **de
confianza** desde PostgreSQL 13: la puede crear el **dueño de la base de datos** sin ser superusuario,
por lo que funciona con el rol que ejecuta `prisma migrate deploy` en Render PostgreSQL, Railway y
similares (el rol que crea la base suele ser su dueño). Si el hosting restringe extensiones:

1. Verificar antes de desplegar: `SELECT name, trusted FROM pg_available_extensions WHERE name = 'pg_trgm';`
   debe existir y la migración fallará con `permission denied to create extension` si el rol no es
   dueño de la base.
2. Si falla, que un superusuario o el panel del hosting ejecute **una vez** `CREATE EXTENSION pg_trgm;`
   en la base de datos de la aplicación y volver a desplegar (la migración usa `IF NOT EXISTS`).
3. Si la migración quedó a medias, `prisma migrate resolve` solo tras revisar el estado: la migración
   corre en una transacción, así que un fallo no deja índices parciales.

El rol de la aplicación en tiempo de ejecución no necesita ningún privilegio especial sobre la extensión
(solo usa los índices).

## Rol de la base de datos sin TRUNCATE

Decisión D3 ([RESOLUCIONES-2026-11-09](../business/RESOLUCIONES-2026-11-09.md)), implementada el
2026-11-10. Los triggers append-only de `inventory_movements` y `audit_logs` son por fila y `TRUNCATE`
no los dispara; por eso, en producción, el rol con el que corre la aplicación **no tiene el permiso
`TRUNCATE`** en ninguna tabla. No se usa un trigger `BEFORE TRUNCATE` porque rompería `resetDatabase`
de las pruebas.

- **Cómo se aplica:** el `CMD` de la imagen ejecuta, después de `prisma migrate deploy` y con el mismo
  `DATABASE_URL`, `npx prisma db execute --file prisma/privileges/revoke-app-truncate.sql`. El script
  (un bloque `DO`, idempotente, no toca datos) revoca `TRUNCATE` al rol conectado en todas las tablas de
  `public` de las que es dueño y en sus privilegios por defecto, para que las tablas que creen las
  migraciones futuras nazcan sin él. Se repite en cada arranque, así que no hay pasos manuales.
- **Requisito:** que la aplicación se conecte con el rol **dueño** de las tablas (el que ejecuta las
  migraciones: hoy es el mismo `DATABASE_URL`) y que ese rol **no sea superusuario** (un superusuario
  no pasa por la comprobación de privilegios). Verificarlo en el hosting elegido con
  `SELECT rolsuper FROM pg_roles WHERE rolname = current_user;` (debe ser `f`). Si el rol es
  superusuario, el script lo avisa con un `WARNING` en el registro de arranque y no tiene efecto; si hay
  tablas de otro dueño, también lo avisa.
- **Comprobar** (con `psql` y el rol de la aplicación): `SELECT has_table_privilege('inventory_movements', 'TRUNCATE');`
  debe devolver `f`. `scripts/smoke-image.sh` verifica en cada CI que, tras el arranque, ninguna tabla
  conserva `TRUNCATE` para el rol de la aplicación.
- **Límites:** el dueño de una tabla siempre puede volver a concederse el permiso (`GRANT`) o desactivar
  triggers. La medida evita un `TRUNCATE` accidental o inyectado desde la aplicación, no a quien ya
  controla la credencial del dueño. Separar un rol de migración (dueño) y otro de ejecución solo con DML
  (X-02 del informe técnico 04) es una mejora posible que **no** forma parte de D3 y sigue sin aprobar.
- **Despliegue local en la PC de la tienda (D5; implementado el 2026-11-17):** el PostgreSQL de
  `docker-compose.yml` crea `POSTGRES_USER` como superusuario, que ahora **solo administra**. `npm run
local:up` crea (o corrige) en cada ejecución el usuario `APP_DB_USER` (por defecto `joyeria_app`, con
  `APP_DB_PASSWORD` aleatoria que agrega a `.env` si falta), **sin** superusuario ni permisos para
  crear bases o usuarios. Le traspasa la base, sus tablas, secuencias, funciones y enums (no los de la
  extensión `pg_trgm`) y le quita `TRUNCATE`; el contenedor de la aplicación, las migraciones y la siembra
  se conectan con ese usuario. Una instalación anterior, con las tablas a nombre del superusuario, se
  traspasa sola en su siguiente `local:up`. La contraseña viaja a PostgreSQL solo como verificador
  SCRAM. Código: `scripts/db-app-role.mjs` (SQL idempotente) y `scripts/local-deploy.mjs`. Se comprueba
  con `npm run local:status`: «Protección del libro: activa». Sin `APP_DB_USER` (desarrollo,
  `docker compose --profile prod up`), la imagen sigue usando `POSTGRES_USER` y el script emite el
  `WARNING`.
- **Restaurar una copia** ([BACKUPS.md](BACKUPS.md)): el siguiente arranque de la imagen vuelve a
  aplicar el script; no hace falta ningún paso extra. En la PC de la tienda, `npm run backup:restore`
  además devuelve la base restaurada a `APP_DB_USER` (los respaldos se guardan sin dueños ni permisos).

## Primer despliegue (paso a paso)

1. Crear repositorio en GitHub y subir `main` y `develop`.
2. Crear la base PostgreSQL administrada (región más cercana a Bolivia disponible, p. ej. US East).
3. Crear el Web Service desde el repo con runtime Docker; health check en `/api/v1/health`.
4. Cargar las variables de entorno de la tabla anterior.
5. Deploy: el contenedor ejecuta `prisma migrate deploy`, quita `TRUNCATE` al rol de la aplicación (ver
   «Rol de la base de datos sin TRUNCATE») y arranca.
6. Ejecutar el seed **estructural** una vez desde la shell del servicio (directorio de trabajo
   `/app/apps/api`), con `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` y `SEED_ADMIN_PASSWORD` definidos:
   `node dist/seed.js`. Carga permisos, roles, el administrador inicial, las definiciones de atributos,
   los motivos de ajuste y los tipos de costo; es idempotente y **no** carga datos DEMO. Luego borrar
   esas variables. **No** usar `npx prisma db seed` en la imagen (ver la nota siguiente).
7. Configurar dominio propio en el hosting y registro CNAME en Cloudflare → HTTPS automático.
8. Ingresar, **cambiar la contraseña del administrador** y crear los usuarios reales.
9. Configurar backups externos (ver [BACKUPS.md](BACKUPS.md)) y probar una restauración.

**Seed de producción: verificado ejecutándolo (2026-11-10).** Con la imagen anterior, `npx prisma db seed`
dentro del contenedor falla con `Error: Command failed with ENOENT: tsx prisma/seed.ts` /
`spawn tsx ENOENT` y la base queda sin permisos, roles ni usuarios: `prisma.config.ts` ejecuta
`tsx prisma/seed.ts`, `tsx` es dependencia de desarrollo (la imagen instala con `npm ci --omit=dev`) y la
imagen tampoco contiene `src/` ni el código fuente de `@joyeria/shared`. Por eso `tsup` compila además
`prisma/seed.ts` a `dist/seed.js` (misma lógica, mismo bundle que la API) y el paso 6 usa
`node dist/seed.js`. En desarrollo no cambia nada: `npm run db:seed` (estructura) y
`npm run db:seed:demo` (datos DEMO, se niega a correr en producción) siguen usando `tsx`. El CI lo
comprueba en cada ejecución con la prueba de arranque de la imagen (ver abajo).

## Prueba de arranque de la imagen (smoke)

`scripts/smoke-image.sh` es la prueba que ejecuta el job `docker` del CI tras construir la imagen, y se
puede correr igual en local (Git Bash en Windows):

```bash
docker build -t joyeria-sole:ci .
bash scripts/smoke-image.sh joyeria-sole:ci
```

Crea una red y un PostgreSQL 18 efímeros propios (nombres `smoke-*` con sufijo aleatorio, sin publicar el
puerto de la base) y comprueba: arranque con el `CMD` real (`prisma migrate deploy` desde una base vacía +
servidor) con `NODE_ENV=production`, `COOKIE_SECURE=false` y `TRUST_PROXY_HOPS=0` (HTTP local);
`GET /api/v1/health` = 200 en ≤ 90 s; la SPA en `/`; que ninguna tabla conserve `TRUNCATE` para el rol de
la aplicación (ACL efectiva; el rol de esa base efímera es superusuario, por eso no se usa
`has_table_privilege`); `node dist/seed.js` dos veces (idempotente); login del
administrador sembrado = 200 y con una contraseña incorrecta = 401. Las credenciales se generan con
`openssl rand` en cada ejecución, no se imprimen y no se pasan en la línea de comandos de `docker`. Al
terminar (también si falla) borra solo los contenedores y la red que creó; si falla, muestra las últimas
líneas del registro de la aplicación. Requiere `bash`, `openssl`, `curl` y Docker.

## Flujo continuo (previsto)

Es el flujo que se configurará al elegir hosting; hoy ningún merge despliega.

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

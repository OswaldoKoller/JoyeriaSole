# Seguridad

## Medidas implementadas

| Área                     | Medida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Dónde                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contraseñas              | Argon2id (19 MiB, t=2, p=1 — parámetros OWASP). Nunca se registran ni se devuelven.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `apps/api/src/lib/password.ts`                                     |
| Sesiones                 | Token aleatorio de 256 bits; en BD solo su hash SHA-256; expiración (8 h fijas desde el login, sin extensión por actividad; P-19/Q-02) y revocación en logout; usuarios inactivos pierden acceso inmediatamente.                                                                                                                                                                                                                                                                                                                                                    | `plugins/auth.ts`, tabla `sessions`                                |
| Clave temporal (F2)      | El Administrador restablece la clave de otra persona (`users:manage`): mínimo 10 caracteres, revoca sus sesiones, auditoría sin la clave. Con `must_change_password` la API solo atiende `/auth/*` (403 `PASSWORD_CHANGE_REQUIRED`) hasta que la cambie.                                                                                                                                                                                                                                                                                                            | `users.service.ts`, `plugins/auth.ts`                              |
| Cookie                   | `httpOnly`, `SameSite=Strict`, `Secure` en producción, prefijo `__Host-`, firmada con `AUTH_SECRET`. Al cerrar sesión o cambiar la clave, la cookie se borra con los mismos atributos (con `__Host-` el navegador ignora un borrado sin `Secure`). Con `COOKIE_SECURE=false` en `production` la API registra un aviso al arrancar (solo para probar la imagen en local sin HTTPS).                                                                                                                                                                                  |
| Enumeración de usuarios  | Mismo mensaje y tiempo de respuesta para correo inexistente y contraseña incorrecta (hash ficticio).                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `auth.service.ts`                                                  |
| Fuerza bruta             | Rate limit global 300 req/min por IP; login y cambio de clave 10 intentos / 15 min por IP. La IP sale de `TRUST_PROXY_HOPS` (ver «Proxy»). Las **imágenes** (`/products/:id/photos/:photoId` y `/products/variants/:variantId/cover`) no cuentan para el límite global (una lista muestra decenas de miniaturas): tienen un tope alto de **3000/min por usuario** (se evalúa tras autenticar). `/health` tiene su propio límite de **60/min por IP**.                                                                                                               |
| Autorización             | RBAC por **permiso** (no por rol) en cada endpoint con `requirePermission(...)`. Denegaciones logueadas.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `plugins/auth.ts`                                                  |
| CSRF                     | Cookie SameSite=Strict + rechazo de métodos que modifican datos desde orígenes no permitidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `plugins/security.ts`                                              |
| CORS                     | Lista blanca explícita (`CORS_ORIGIN`). En producción no se necesita (mismo origen).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `plugins/security.ts`                                              |
| Cabeceras                | Helmet: CSP estricta, `frame-ancestors 'none'`, HSTS en producción, nosniff, etc.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `plugins/security.ts`                                              |
| Validación               | Zod en todo input (body, query, params) y en las respuestas (no se filtran campos no declarados). Límite de cuerpo 1 MiB (salvo las fotos: 5 MB, ver más abajo).                                                                                                                                                                                                                                                                                                                                                                                                    | rutas + `fastify-type-provider-zod`                                |
| Inyección SQL            | Prisma parametriza todas las consultas. `$queryRaw` solo con tagged templates; `$executeRawUnsafe` prohibido salvo en tests.                                                                                                                                                                                                                                                                                                                                                                                                                                        | ESLint/revisión                                                    |
| XSS                      | React escapa por defecto; prohibido `dangerouslySetInnerHTML`. CSP sin `unsafe-inline` para scripts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                                                  |
| Errores                  | Nunca se exponen stack traces, SQL ni mensajes internos. `requestId` para correlacionar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `plugins/error-handler.ts`                                         |
| Logs                     | Redacción automática de `cookie`, `authorization`, `password`, `token`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `app.ts`                                                           |
| Auditoría                | Logins (exitosos y fallidos), logouts y las acciones de negocio (`recordAudit`); tablas append-only protegidas por trigger. **Solo el Administrador la consulta** (`audit:read`, Q-15.3; pantalla `/auditoria`, solo lectura). Al leerla se redactan (`[oculto]`) las claves `password`, `passwordHash`, `tokenHash`, `token`, `secret`, `cookie` y `authorization` en `before`/`after`/`metadata`.                                                                                                                                                                 | `audit.service.ts`, `audit-query.service.ts`, `audit-redaction.ts` |
| Secretos                 | Solo por variables de entorno, validadas al arrancar (`AUTH_SECRET` ≥ 32 caracteres). `.env` en `.gitignore`.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `config/env.ts`                                                    |
| Contenedor               | Imagen Alpine, usuario no-root, solo dependencias de producción.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `Dockerfile`                                                       |
| Proxy                    | `TRUST_PROXY_HOPS` (entero ≥ 0, por defecto **0**): número de proxies propios delante de la API cuyo `X-Forwarded-For` se acepta, contado **desde el último salto**; las entradas que el cliente añade a la izquierda se ignoran, así falsear la cabecera no cambia la IP usada por el límite de login. Reemplaza al booleano `TRUST_PROXY` (que confiaba en toda la cadena y permitía evadir el límite); si el entorno aún define `TRUST_PROXY=true` la API **no arranca** y pide migrar. Un valor mayor que el real vuelve a permitir falsear la IP.              |
| Transporte y caché       | Fastify con `requestTimeout` 120 s, `connectionTimeout` 120 s y `keepAliveTimeout` 65 s (las subidas de 5 MB caben de sobra). Toda respuesta bajo `/api/*` lleva `Cache-Control: no-store`, salvo las imágenes (portada y fotos), que fijan su propio `Cache-Control` con `ETag`. Sin mapas de código (`sourcemap` desactivado en web y API; la imagen elimina cualquier `.map`). El contenedor arranca con `exec node` para que `SIGTERM` llegue a la API. PostgreSQL de desarrollo escucha solo en `127.0.0.1`.                                                   |
| Sesión por petición      | Cada petición relee sesión, usuario, roles y permisos con **una sola consulta** (sin caché: la revocación, la desactivación y los cambios de permisos rigen de inmediato) y solo las columnas necesarias; `passwordHash` nunca se carga. Las transacciones interactivas tienen por defecto 30 s de ejecución y 10 s de espera de conexión (conteos: 60 s). Un deadlock o tiempo agotado (`P2034`, `P2028`, SQLSTATE `40P01`/`40001`) responde **503 `SERVICE_UNAVAILABLE`** con `Retry-After` y sin detalles internos.                                              |
| Archivos subidos (fotos) | Validación por **contenido** (firma JPEG/PNG/WebP; se ignoran extensión y `Content-Type`), re-codificación obligatoria a WebP con `sharp` (descarta EXIF, GPS y contenido incrustado), tope de 30 Mpx y máximo 2 imágenes procesándose a la vez, 5 MB y 1 archivo por petición (`@fastify/multipart` solo en las rutas de fotos), 5 fotos por producto, 40 subidas/min. Se sirven con `Content-Type` de lista blanca, `nosniff`, CSP `default-src 'none'; sandbox`, `ETag` y caché privada; subir/borrar exige `catalog:manage`, ver exige `catalog:read`. ADR-020. |
| Integridad de datos      | CHECK constraints y triggers en BD como última línea de defensa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `docs/database/DATABASE.md`                                        |

## Reglas para desarrolladores

1. Todo endpoint nuevo: `requirePermission(...)` (o justificación explícita si es público) + esquema Zod.
2. Toda operación que cambie stock, costos, precios, estados o usuarios: **auditoría en la misma transacción**.
3. Nunca devolver `passwordHash`, `tokenHash` ni datos de sesión. Declarar siempre el esquema de respuesta.
4. Nunca concatenar SQL. Nunca `eval`, `new Function`, ni `dangerouslySetInnerHTML`.
5. Nunca registrar datos sensibles en logs.
6. Nunca commitear `.env`, credenciales, dumps de BD ni backups.
7. Dependencias nuevas: revisar mantenimiento y `npm audit` antes de agregarlas.

## Roles y permisos: quién puede qué

Fuente de verdad: `packages/shared/src/permissions.ts` (`DEFAULT_ROLE_PERMISSIONS`, solo para el seed
inicial; luego los roles se administran en base de datos y en la pantalla «Roles», P-46). La API
autoriza siempre por permiso, nunca por nombre de rol.

**Regla de autorización compartida (cliente, 2026-11-05):** tanto el **Administrador** como el
**Responsable de inventario** pueden autorizar. Ver [RESOLUCIONES-2026-11-05](../business/RESOLUCIONES-2026-11-05.md).

Pueden **Administrador y Responsable de inventario** (el Vendedor no puede ninguna de estas):

- Solicitar ajustes y cambios de precio (`inventory:adjust`, `prices:propose`).
- Aprobar o rechazar ajustes (`inventory:adjust-approve`) y cargar el stock inicial (`inventory:initial-stock`).
- Aprobar o rechazar precios, cambiarlos directamente (origen `ADMIN_DIRECT`, etiqueta «Cambio directo (con
  autorización)») y fijar el precio inicial (`prices:approve`).
- Aprobar conteos físicos (`inventory-counts:approve`) y registrar cambios de pieza (`inventory:exchange`).

Son **exclusivos del Administrador** (el Responsable no los tiene):

- Auditoría (`audit:read`, Q-15.3).
- Usuarios, roles y restablecer claves (`users:read`, `users:manage`, `roles:read`, `roles:manage`).
- Borrado físico de fichas de producto (`catalog:delete`).
- Configuración del sistema y datos del negocio (`settings:manage`).
- Corregir cierres de caja (`cash:correct`) y ver, atender y cerrar incidencias de venta
  (`sales-incidents:manage`).

**Ventas y caja** (plan 11, autorizado el 2026-11-10; D-01, D-02 y D-13 son valores por defecto
pendientes de confirmación):

| Permiso                   | Administrador | Responsable | Vendedor |
| ------------------------- | :-----------: | :---------: | :------: |
| `sales:create`            |      sí       |     sí      |    sí    |
| `sales:read` (propias)    |      sí       |     sí      |    sí    |
| `sales:read-all`          |      sí       |     sí      |    no    |
| `cash:read`               |      sí       |     sí      |    no    |
| `cash:open`, `cash:close` |      sí       |     sí      |    no    |
| `cash:correct`            |      sí       |     no      |    no    |
| `sales-incidents:report`  |      sí       |     sí      |    sí    |
| `sales-incidents:manage`  |      sí       |     no      |    no    |

No existe ningún permiso de anulación, devolución, edición de ventas, reapertura o movimientos de caja
(DEC-V07); una guarda estática lo verifica. Ninguna respuesta de ventas contiene costos, para ningún
rol. La venta ajena (sin `sales:read-all`) responde `404`, no `403`, para no revelar que existe.

**Permisos exclusivos del Administrador frente a la pantalla «Roles»:** `cash:correct`,
`sales-incidents:manage` y `settings:manage` (`ADMIN_ONLY_PERMISSIONS`) **no se pueden conceder a
ningún otro rol**, ni siquiera por un Administrador: la API responde `422` con la lista
(`details.permissions`) y `GET /roles/permissions` los marca con `adminOnly: true` para que la
pantalla los deshabilite.

El Vendedor tiene `catalog:read`, `inventory:read`, `sales:create`, `sales:read` y
`sales-incidents:report`, sin costos (P-02) ni caja.

**Escalada de privilegios (S-01/S-02):** solo un Administrador puede **conceder o quitar el rol
`ADMIN`** (al crear un usuario o al reasignar roles) y modificar la cuenta de otro Administrador
(editar, restablecer clave, reasignar roles). Un rol personalizado con `users:manage` + `roles:manage`
recibe 403 con un mensaje claro al intentarlo.

**Gestión de roles por pantalla (P-46, 2026-11-10):** el rol Administrador es inmutable (no pierde
permisos, no se renombra ni se elimina), así que el sistema nunca queda sin un administrador activo con
todos los permisos. Los otros roles de sistema no pierden sus permisos base. **Nadie concede lo que no
tiene:** quien administra roles o usuarios sin un permiso no puede agregarlo a un rol, ni asignar a una
persona (o a sí mismo) un rol que lo incluya (`403`). Todo cambio de rol queda en `audit_logs`
(`role.created`, `role.updated`, `role.deleted`, con antes/después) en la misma transacción. Los
permisos se leen en cada petición: un cambio rige de inmediato en las sesiones abiertas.
Los permisos exclusivos del Administrador (`cash:correct`, `sales-incidents:manage`,
`settings:manage`) no se pueden asignar a otros roles (ver arriba).

**Notas de movimientos (S-03):** `GET /inventory/movements` y `GET /inventory/:variantId/movements`
devuelven `notes` solo si la persona tiene `inventory:adjust`, `stock-entries:read` o `audit:read`; el
resto recibe `null` (el Vendedor no ve observaciones libres con costos o faltantes).

Un rol personalizado con solo `inventory:adjust` o `prices:propose` sigue el flujo **solicitar → aprobar**:
solicita y otra persona con el permiso de aprobar decide. El Responsable puede aprobar sus propias
solicitudes (no hay segregación obligatoria); el riesgo está aceptado más abajo.

## Riesgos conocidos y aceptados

| Riesgo                                                                                                                                    | Evaluación                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit` reporta 4 vulnerabilidades _high_ en `mysql2` y `deepmerge-ts`, dependencias transitivas del **CLI de Prisma 7** (oct. 2026). | `mysql2` solo se usa con bases MySQL (no es nuestro caso). `deepmerge-ts` se usa para combinar la configuración local de Prisma (entrada de confianza). No explotables en este uso. La "solución" de npm es bajar a Prisma 6 (cambio incompatible). **Acción:** actualizar Prisma cuando publique la corrección. |
| Sin 2FA.                                                                                                                                  | Decisión aprobada P-19 (2026-10-09).                                                                                                                                                                                                                                                                             |
| Auto-aprobación: el Responsable puede aprobar sus propias solicitudes (ajustes, precios, conteos) y registrar cambios de pieza.           | Aceptado por regla del cliente (2026-11-05): evita bloqueos. No hay segundo aprobador; la trazabilidad está en la auditoría (quién pidió, quién aprobó, cuándo) y en el historial propio de cada módulo. Alternativa futura: segundo aprobador por umbral de valor (P-43).                                       |

## Pendiente para producción

- [ ] Rotación de `AUTH_SECRET` documentada (invalida todas las sesiones).
- [ ] Cambio obligatorio de contraseña del administrador inicial en el primer ingreso (Fase 1, módulo usuarios).
- [ ] Limpieza periódica de sesiones vencidas (tarea programada).
- [ ] Monitoreo de intentos de login fallidos (alerta).
- [ ] Verificar alta, cambio de contraseña y expiración de sesión según P-19 aprobada.

## Reporte de vulnerabilidades

Comunicar en privado al responsable técnico del proyecto. No abrir issues públicos con detalles explotables.

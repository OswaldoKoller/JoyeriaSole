# ADR-003: Autenticación con sesiones en servidor

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Contexto

Sistema interno accedido por navegador desde Internet, con pocos usuarios y datos sensibles (costos,
stock). Se necesita poder cerrar sesiones de inmediato (desvinculación, robo de equipo).

## Decisión

- Login con correo + contraseña (hash **Argon2id**).
- Sesión en servidor (tabla `sessions`): token aleatorio de 256 bits en cookie **httpOnly,
  SameSite=Strict, Secure, prefijo `__Host-`**, firmada; en BD solo el hash SHA-256 del token.
- Expiración fija desde el login (`SESSION_TTL_HOURS`, ver enmienda de 2026-11-05), revocación en
  logout; usuarios inactivos quedan bloqueados en la siguiente petición.
- Frontend y API en el **mismo origen** (ADR-012), lo que permite SameSite=Strict.

## Alternativas consideradas

- JWT en localStorage: expuesto a XSS y no revocable sin lista negra.
- JWT en cookie: revocación igualmente compleja; sin ventaja con un solo backend.
- Proveedor externo (Auth0, Clerk, Supabase Auth): costo y dependencia innecesarios para pocos usuarios.

## Consecuencias

- Una consulta a BD por petición autenticada (aceptable a esta escala; cacheable si hiciera falta).
- Una futura app móvil necesitaría tokens de acceso (decisión futura).
- 2FA y política de contraseñas: resueltas en P-19 (mínimo 10 caracteres, sin 2FA).

## Enmienda 2026-11-05 — sesión de 8 horas y clave temporal

- **Sesión fija de 8 horas** desde el login, sin extensión por actividad (P-19 cambia de 3 h a 8 h;
  Q-02 opción A del cliente). `SESSION_TTL_HOURS` solo acepta `8`; la expiración se calcula al iniciar
  sesión y `last_seen_at` nunca la modifica. Pasadas las 8 horas se exige un nuevo login.
- **Contraseña olvidada (F2):** el Administrador asigna una clave **temporal** a otra persona
  (`POST /users/:id/reset-password`, permiso `users:manage`). Se marca `users.must_change_password`,
  se revocan todas las sesiones de esa persona y la auditoría no registra la clave. Mientras la marca
  esté activa, `requirePermission` responde `403 PASSWORD_CHANGE_REQUIRED` en todas las rutas; solo
  `/auth/me`, `/auth/logout` y `/auth/change-password` (que usan `authenticate`) atienden. El cambio
  exitoso limpia la marca, exige que la nueva clave sea distinta de la temporal y cierra las sesiones.
  Un administrador no puede restablecer su propia clave por esa vía (usa «Mi cuenta»), de modo que
  siempre conserva acceso. El login devuelve `{ data: { mustChangePassword } }` (antes `204`).

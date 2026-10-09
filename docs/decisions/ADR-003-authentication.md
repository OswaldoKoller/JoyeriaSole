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
- Expiración configurable (`SESSION_TTL_HOURS`), revocación en logout; usuarios inactivos quedan
  bloqueados en la siguiente petición.
- Frontend y API en el **mismo origen** (ADR-012), lo que permite SameSite=Strict.

## Alternativas consideradas

- JWT en localStorage: expuesto a XSS y no revocable sin lista negra.
- JWT en cookie: revocación igualmente compleja; sin ventaja con un solo backend.
- Proveedor externo (Auth0, Clerk, Supabase Auth): costo y dependencia innecesarios para pocos usuarios.

## Consecuencias

- Una consulta a BD por petición autenticada (aceptable a esta escala; cacheable si hiciera falta).
- Una futura app móvil necesitaría tokens de acceso (decisión futura).
- 2FA y política de contraseñas: PENDIENTE P-19.

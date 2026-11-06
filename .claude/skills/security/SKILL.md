---
name: security
description: Controles de seguridad obligatorios del proyecto Joyería Sole (auth por sesión, permisos, validación, CSRF, secretos, logs, auditoría) y checklist de revisión. Usar al crear endpoints, manejar datos sensibles, agregar dependencias o revisar un cambio.
---

# Seguridad

Referencia: `docs/security/SECURITY.md`.

## Ya implementado — no romper

- Sesión: cookie `__Host-sid` (prod) / `sid` (dev), httpOnly, SameSite=Strict, firmada; token en BD
  solo como SHA-256 (`plugins/auth.ts`).
- Argon2id para contraseñas (`lib/password.ts`); hash ficticio contra enumeración de usuarios.
- `requirePermission(...)` y `authenticate` como `preHandler`.
- Helmet + CSP, CORS con lista blanca, rate limit global y de login, verificación de origen (CSRF)
  en métodos que modifican datos (`plugins/security.ts`).
- Error handler sin filtración de detalles; `requestId`.
- Redacción de cookie/authorization/password/token en logs.
- Tablas append-only (movimientos, auditoría).

## Checklist de revisión de un cambio

- [ ] Todo endpoint nuevo tiene permiso (o justificación de por qué es público).
- [ ] Zod en `body`, `querystring`, `params` y `response`.
- [ ] No se devuelve `passwordHash`, `tokenHash`, sesiones ni costos a quien no tiene `costs:read`.
- [ ] Sin SQL concatenado (`$queryRaw` solo con template; nunca `$queryRawUnsafe` con input).
- [ ] Operaciones sensibles auditadas en la misma transacción.
- [ ] Sin secretos en código/tests/docs; variables nuevas en `config/env.ts` + `.env.example`.
- [ ] Sin datos sensibles en logs (`request.log.info({ body })` está prohibido en rutas de auth/usuarios).
- [ ] IDs de recursos validados (`z.uuid()`) y existencia verificada (404).
- [ ] Autorización a nivel de objeto si aplica (p. ej. solo editar ingresos en `DRAFT`).
- [ ] Dependencias nuevas: `npm audit`, mantenimiento activo, justificación.
- [ ] Frontend: sin `dangerouslySetInnerHTML`, sin tokens en localStorage.

## Cómo reportar un hallazgo

```
[ALTA] apps/api/src/modules/x/x.routes.ts:42 — El endpoint PATCH /x/:id no tiene requirePermission.
Escenario: un vendedor autenticado puede cambiar precios enviando PATCH directo.
Corrección: preHandler: app.requirePermission(PERMISSIONS.PRICES_APPROVE)
```

## Cambios sensibles que requieren aprobación del usuario

Relajar CSP/CORS/SameSite, cambiar parámetros de Argon2 o duración de sesión, cambiar permisos de
roles (P-01/P-02), exponer nuevos datos personales, cambiar `TRUST_PROXY_HOPS`.

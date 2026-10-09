# ADR-004: Autorización RBAC por permisos

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Contexto

Los roles iniciales (Administrador, Responsable de inventario, Vendedor) son preliminares y pueden cambiar.

## Decisión

- El código autoriza **por permiso** (`requirePermission(PERMISSIONS.STOCK_ENTRIES_CONFIRM)`), nunca
  por nombre de rol.
- Roles = agrupaciones de permisos en BD (`roles`, `permissions`, `role_permissions`); un usuario
  puede tener varios roles (`user_roles`).
- Catálogo de permisos en `packages/shared/src/permissions.ts`, compartido con la UI para mostrar u
  ocultar acciones.
- Asignación inicial preliminar en el seed. Las acciones sensibles tienen permiso propio:
  `costs:read`, `prices:manage`, `stock-entries:confirm`, `inventory-counts:approve`, `inventory:adjust`.

## Alternativas consideradas

- Chequear roles en el código: cada cambio de rol obliga a modificar código.
- ABAC / motor de políticas: excesivo para este tamaño.

## Consecuencias

- Cambiar qué puede hacer un rol no requiere desplegar.
- Agregar un permiso = constante en `shared` + volver a ejecutar el seed (idempotente).
- Decisiones abiertas: P-01, P-02, P-21.

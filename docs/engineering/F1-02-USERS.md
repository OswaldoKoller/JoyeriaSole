# F1-02 — Usuarios y acceso

Estado al 2026-10-09: **consulta, edición, roles múltiples y desactivación verificadas localmente; alta y cambio de contraseña implementados, con E2E final pendiente**. El cliente aprobó P-19 (3 horas fijas, mínimo 10 caracteres, sin 2FA) y P-21 (varios roles). Ver [resoluciones](../business/RESOLUCIONES-2026-10-09.md).

## Resultado buscado

Un administrador puede consultar cuentas, crear usuarios, asignar el número de roles aprobado, cambiar datos y estado, y permitir un cambio seguro de contraseña. El personal ve solo las acciones permitidas por su sesión. No se gestionan permisos individuales ni se modifica la asignación preliminar de los roles del seed en esta tarea.

La entrega de negocio se acepta cuando el cliente completa un recorrido con cuentas sintéticas: crear un usuario, entrar con él, comprobar su acceso, cambiar su contraseña, desactivarlo y comprobar que perdió acceso.

## Porción implementada

- `GET /api/v1/users` y `GET /api/v1/users/:id` con `users:read`, validación, filtros por texto/estado y paginación.
- Respuestas con ID, nombre, correo, roles, estado y fechas; sin hash ni sesiones.
- Pantalla **Usuarios** y enlace en el menú visibles solo para `users:read`.
- `GET /api/v1/users/roles`, `PATCH /api/v1/users/:id` y `PUT /api/v1/users/:id/roles` protegidos por permisos. Permiten nombre/estado y varios roles; al desactivar revocan sesiones. El último administrador activo queda protegido.
- `npm run qa` observado con código 0: 54 pruebas API, 4 de componentes, build y 4 E2E en Chromium. El E2E verificó consulta, recarga y asignación de un segundo rol a un administrador sintético. La prueba concurrente dejó un administrador activo ante dos desactivaciones simultáneas.

La API y la web permiten crear cuentas y cambiar la contraseña propia. Las pruebas de API y componentes pasaron; el E2E final necesita comprobar la redirección tras el nuevo login y no se ha repetido después de ajustar su expectativa. Actualización 2026-10-10: `npm run qa` pasó con los 5 E2E, incluido el recorrido de usuarios; F1-02 queda verificado técnicamente y pendiente de aceptación del cliente.

## Decisiones necesarias antes de mutaciones

| ID   | Respuesta que falta                                                                      | Efecto en el contrato                                                                          |
| ---- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| P-21 | Aprobado: varios roles por usuario.                                                      | La asignación ya puede implementarse; requiere `users:manage` y `roles:manage`.                |
| P-19 | Aprobado: sesión fija (8 h desde 2026-11-05; antes 3 h), mínimo 10 caracteres y sin 2FA. | Validaciones y duración implementadas; restablecimiento con clave temporal (F2) añadido en S1. |

La respuesta del cliente está registrada en [PENDIENTES.md](../business/PENDIENTES.md). La expiración se fija al iniciar sesión y no se extiende por actividad.

## Seguimiento de porciones

| Orden | Comportamiento                                                                                      | Aceptación y pruebas principales                                                                                                          | Dependencia   |
| ----- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| U1    | Crear cuenta con correo, nombre, contraseña inicial y roles aprobados (implementada; E2E pendiente) | 201; email único; hash Argon2id; respuesta sin secreto; 401/403/400/409; auditoría transaccional.                                         | P-19 aprobada |
| U2    | Editar nombre y asignación de roles (verificada localmente)                                         | Permisos de gestión; auditoría antes/después; no dejar el sistema sin un administrador activo, incluso ante desactivaciones concurrentes. | P-21 aprobada |
| U3    | Desactivar/reactivar usuario (verificada localmente)                                                | Un usuario desactivado pierde acceso; no se borra su historial; acción auditada y sesiones revocadas.                                     | U2            |
| U4    | Cambiar contraseña propia (implementada; E2E pendiente)                                             | Exigir contraseña anterior, aplicar política aprobada, auditar sin guardar contraseñas, comprobar sesiones posteriores al cambio.         | P-19 aprobada |
| U5    | Interfaz de gestión completa; E2E final pendiente                                                   | Nombre, estado y roles ya tienen UI; falta recorrido de alta → login → cambio de contraseña → desactivación.                              | U1–U4         |

La protección del último administrador activo es una salvaguarda técnica implementada en la edición y asignación de roles. Revisar concurrencia, auditoría y reacción de sesiones en QA; mostrar la recuperación de una cuenta desactivada durante la demo.

## Puertas del arnés

1. **Lista:** P-19/P-21 resueltas y contrato API/UI aceptado; actualizar esta tarea con entradas y salidas precisas.
2. **Construida:** API, web, auditoría y documentación reflejan el mismo comportamiento.
3. **Verificada:** pruebas de permisos, datos sensibles, duplicados, sesiones y rollback; `npm run qa` verde en base efímera; revisión del diff.
4. **Aceptada:** cliente ejecuta la demo con usuarios sintéticos y confirma el flujo o registra observaciones accionables.

Responsable de integración: coordinación del módulo. Revisión: seguridad y pruebas según [HARNESS.md](HARNESS.md). No se necesita migración para la consulta implementada; cualquier cambio posterior de modelo exige esquema, migración nueva y revisión de SQL. No se autoriza commit, publicación o despliegue por este documento.

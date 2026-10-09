# ADR-010: Logs técnicos vs. auditoría de negocio

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Decisión

|             | Logs técnicos                                                         | Auditoría de negocio                                                      |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Propósito   | Diagnosticar errores y rendimiento                                    | Responder "quién hizo qué, cuándo y qué cambió"                           |
| Herramienta | pino (logger de Fastify), JSON a stdout                               | Tabla `audit_logs` en PostgreSQL                                          |
| Contenido   | Peticiones, errores con stack, advertencias de seguridad, `requestId` | Acción `entidad.acción`, usuario, entidad, antes/después, IP, `requestId` |
| Retención   | La del hosting (días)                                                 | Permanente (P-23)                                                         |
| Mutabilidad | —                                                                     | Append-only (trigger)                                                     |
| Escritura   | Automática                                                            | En la **misma transacción** que la operación (`recordAudit(tx, ...)`)     |

- Datos sensibles redactados en los logs (cookies, contraseñas, tokens).
- El `requestId` (cabecera `x-request-id`) une ambos registros.
- Acciones a auditar en Fase 1: login/logout/fallos; alta, cambios y desactivación de usuarios y roles;
  creación, modificación y desactivación de productos y variantes; cambios de costo/precio; ingresos
  (crear, confirmar, cancelar); ajustes; aprobación de inventarios físicos.

## Consecuencias

En producción se recomienda enviar stdout a un servicio de logs (el del hosting, Better Stack o Grafana).

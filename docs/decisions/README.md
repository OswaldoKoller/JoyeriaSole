# Registro de decisiones de arquitectura (ADR)

Cada decisión estructural se documenta en `ADR-NNN-titulo.md` con contexto, decisión, alternativas,
consecuencias y estado. Un ADR aceptado no se edita: si la decisión cambia, se crea uno nuevo que lo
**reemplaza** y el anterior se marca _Reemplazado por ADR-XXX_.

Las decisiones de **negocio** pendientes están en [`docs/business/PENDIENTES.md`](../business/PENDIENTES.md).

| ADR                                                          | Título                                              | Estado                             |
| ------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------- |
| [001](ADR-001-product-vs-variant.md)                         | Producto vs. variante                               | Aceptado                           |
| [002](ADR-002-database.md)                                   | PostgreSQL + Prisma                                 | Aceptado                           |
| [003](ADR-003-authentication.md)                             | Autenticación con sesiones en servidor              | Aceptado                           |
| [004](ADR-004-authorization.md)                              | Autorización RBAC por permisos                      | Aceptado                           |
| [005](ADR-005-categories.md)                                 | Categorías como árbol                               | Aceptado                           |
| [006](ADR-006-attributes.md)                                 | Sistema de atributos                                | Aceptado                           |
| [007](ADR-007-inventory-ledger.md)                           | Inventario como libro de movimientos                | Aceptado                           |
| [008](ADR-008-stock-entries-costs.md)                        | Ingresos de mercadería y costos                     | Aceptado (prorrateo en ADR-013)    |
| [009](ADR-009-physical-counts.md)                            | Inventario físico                                   | Aceptado (enmendado por 017 y 021) |
| [010](ADR-010-logging-audit.md)                              | Logs técnicos vs. auditoría                         | Aceptado                           |
| [011](ADR-011-stack.md)                                      | Stack y monolito modular                            | Aceptado                           |
| [012](ADR-012-deployment.md)                                 | Despliegue en un solo servicio + Docker             | Aceptado (proveedor pendiente)     |
| [013](ADR-013-costeo-ingresos.md)                            | Prorrateo por valor y último costo                  | Aceptado                           |
| [014](ADR-014-conteos-con-movimientos.md)                    | Conteos físicos con movimientos concurrentes        | Aceptado (enmendado por 021)       |
| [015](ADR-015-reparto-centavos-y-valor-cero.md)              | Reparto de centavos y valor cero                    | Aceptado                           |
| [016](ADR-016-compras-en-dolares-y-costos-de-importacion.md) | Compras en dólares y costos de importación          | Aceptado                           |
| [017](ADR-017-ajustes-solicitud-aprobacion.md)               | Ajustes con solicitud y aprobación                  | Aceptado                           |
| [018](ADR-018-aprobacion-e-historial-de-precios.md)          | Aprobación e historial de precios                   | Aceptado                           |
| [019](ADR-019-cambios-de-pieza.md)                           | Cambios de pieza como doble movimiento atómico      | Aceptado                           |
| [020](ADR-020-fotos-de-producto.md)                          | Fotos de producto en PostgreSQL tras `PhotoStorage` | Aceptado                           |
| [021](ADR-021-conteo-a-ciegas-segundo-recuento.md)           | Conteo físico a ciegas con segundo recuento         | Aceptado (enmienda de 009 y 014)   |
| [022](ADR-022-venta-de-mostrador-inmutable.md)               | Venta de mostrador atómica, idempotente e inmutable | Aceptado                           |
| [023](ADR-023-caja-unica-arqueo-y-correcciones.md)           | Caja única, arqueo y correcciones append-only       | Aceptado                           |
| [024](ADR-024-comprobante-interno.md)                        | Comprobante interno e impresión por navegador       | Aceptado                           |

Los ADR 017, 018, 019 y 021 llevan al final una nota «Actualización 2026-11-05» con la regla de
autorización compartida (el Administrador y el Responsable de inventario autorizan; ver
[RESOLUCIONES-2026-11-05](../business/RESOLUCIONES-2026-11-05.md)). El texto original no se reescribe.

Ventas y caja (autorizadas el 2026-11-10): los documentos de análisis de
[`docs/propuestas/fase-2-ventas`](../propuestas/fase-2-ventas/11-plan-de-implementacion.md) citaban
estos ADR con otra numeración. Equivalencias: **022 = «ADR-024»** (venta), **023 = «ADR-028»** (caja)
y **024 = «ADR-029»** (comprobante). El «ADR-025» de esos documentos (anulación de ventas) **no se
emite**: lo sustituye DEC-V07 (no se anulan ventas). Nota a ADR-017 y ADR-019: los ajustes y los
cambios de pieza no se usan para corregir ventas (C5).

Plantilla: [`TEMPLATE.md`](TEMPLATE.md).

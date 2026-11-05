# Registro de decisiones de arquitectura (ADR)

Cada decisión estructural se documenta en `ADR-NNN-titulo.md` con contexto, decisión, alternativas,
consecuencias y estado. Un ADR aceptado no se edita: si la decisión cambia, se crea uno nuevo que lo
**reemplaza** y el anterior se marca _Reemplazado por ADR-XXX_.

Las decisiones de **negocio** pendientes están en [`docs/business/PENDIENTES.md`](../business/PENDIENTES.md).

| ADR                                             | Título                                              | Estado                         |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------ |
| [001](ADR-001-product-vs-variant.md)            | Producto vs. variante                               | Aceptado                       |
| [002](ADR-002-database.md)                      | PostgreSQL + Prisma                                 | Aceptado                       |
| [003](ADR-003-authentication.md)                | Autenticación con sesiones en servidor              | Aceptado                       |
| [004](ADR-004-authorization.md)                 | Autorización RBAC por permisos                      | Aceptado                       |
| [005](ADR-005-categories.md)                    | Categorías como árbol                               | Aceptado                       |
| [006](ADR-006-attributes.md)                    | Sistema de atributos                                | Aceptado                       |
| [007](ADR-007-inventory-ledger.md)              | Inventario como libro de movimientos                | Aceptado                       |
| [008](ADR-008-stock-entries-costs.md)           | Ingresos de mercadería y costos                     | Aceptado (prorrateo pendiente) |
| [009](ADR-009-physical-counts.md)               | Inventario físico                                   | Aceptado                       |
| [010](ADR-010-logging-audit.md)                 | Logs técnicos vs. auditoría                         | Aceptado                       |
| [011](ADR-011-stack.md)                         | Stack y monolito modular                            | Aceptado                       |
| [012](ADR-012-deployment.md)                    | Despliegue en un solo servicio + Docker             | Aceptado (proveedor pendiente) |
| [013](ADR-013-costeo-ingresos.md)               | Prorrateo por valor y último costo                  | Aceptado                       |
| [014](ADR-014-conteos-con-movimientos.md)       | Conteos con movimientos concurrentes                | Aceptado parcialmente          |
| [015](ADR-015-reparto-centavos-y-valor-cero.md) | Reparto de centavos y valor cero                    | Aceptado                       |
| [020](ADR-020-fotos-de-producto.md)             | Fotos de producto en PostgreSQL tras `PhotoStorage` | Aceptado                       |

Plantilla: [`TEMPLATE.md`](TEMPLATE.md).

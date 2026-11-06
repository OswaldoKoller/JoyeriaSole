# ADR-018: Aprobación e historial de precios

- **Estado:** Aceptado (decisiones del cliente del 2026-11-05: D1–D9, Q-04, Q-05, Q-06)
- **Fecha:** 2026-11-06
- **Sustituye:** la fórmula `costo total × 2` y el «multiplicador por categoría» de P-03 (y la sugerencia automática D3). Las notas de [ADR-013](ADR-013-costeo-ingresos.md) y [ADR-008](ADR-008-stock-entries-costs.md) que hablan de un «precio base de P-03» o de un flujo de precios pendiente quedan resueltas por este ADR: el precio no se calcula, se **fija a mano** y su cambio se aprueba aquí.
- **Cierra:** P-25 (aprobación de cambios de precio). **Sustituye:** P-03.

## Contexto

El cliente fija el precio de venta de **cada ítem** mirando su costo: a veces gana 50 %, a veces hasta 250 %. Descartó el multiplicador (global, por categoría y por producto), el redondeo automático y la sugerencia de precio (Q-04, Q-05). Quiere ver, para decidir, el precio de compra, el subtotal, los costos adicionales y el costo total, y la **ganancia** frente a ese costo (Q-06). El Responsable de inventario propone precios; solo el Administrador los aprueba, y puede cambiarlos directamente (D4). El historial de precios es una entidad propia (D5). Hasta ahora `sale_price` solo se podía fijar al crear la pieza y no tenía historial ni aprobación.

## Decisión

### 1. El precio es manual, neto y por variante

- Un único precio de venta por variante (`product_variants.sale_price`, en Bs, hasta 2 decimales), **neto** (antes de impuestos, D7). Sin listas de precios (D6).
- El sistema **no calcula ni sugiere** precios. Precio `0` es válido y se marca «Sin precio»: no será vendible en la Fase 2 hasta tener precio (D9, Q-11).

### 2. Un solo camino para cambiar el precio

Después de crear la pieza, `sale_price` **solo** cambia por el módulo de precios (`/api/v1/pricing`). Ningún otro endpoint lo modifica (`PATCH /products/:id` rechaza `salePrice` con `400`). El precio **inicial** al crear una pieza o variante solo lo fija quien tiene `prices:approve` y queda en el historial (origen `INITIAL`).

### 3. Flujo y permisos

| Acción                                           | Permiso          | Resultado                                                            |
| ------------------------------------------------ | ---------------- | -------------------------------------------------------------------- |
| Solicitar cambio (uno o varios, en lote)         | `prices:propose` | Solicitud `PENDING` (origen `REQUEST`); el precio vigente no cambia  |
| Aprobar / rechazar (uno o en masa)               | `prices:approve` | `APPROVED` (rige de inmediato) o `REJECTED` (comentario obligatorio) |
| Cambiar directamente («Aplicar ahora»)           | `prices:approve` | `APPROVED` por el propio Administrador (origen `ADMIN_DIRECT`)       |
| Cancelar una solicitud propia mientras `PENDING` | `prices:propose` | `CANCELLED`                                                          |

- Sin umbrales por monto: toda solicitud la decide el Administrador. Vigencia **inmediata** al aprobar.
- Responsable de inventario: `prices:propose` (más `costs:read`). Administrador: todos. Vendedor: ninguno; no llega a ningún endpoint de precios ni ve costos.
- Una variante tiene **como máximo una solicitud pendiente** (índice único parcial). Mientras la haya, el Administrador no puede cambiar esa variante directamente: debe aprobarla, rechazarla o esperar a que se cancele. Es la opción conservadora; evita que el cambio directo deje obsoleta la solicitud de otra persona.
- **Aprobar revalida** que el precio anterior de la solicitud siga siendo el vigente. Si otro cambio se aplicó en medio, responde `409` indicando las solicitudes obsoletas (`error.details.ids`); deben rechazarse y solicitarse de nuevo.
- Las operaciones en lote (solicitar, aplicar, aprobar, rechazar) son **atómicas**: si un elemento falla no se aplica ninguno.

### 4. Historial inmutable: `price_changes`

Cada cambio guarda: variante, precio anterior y nuevo, estado (`PENDING | APPROVED | REJECTED | CANCELLED`), origen (`REQUEST | ADMIN_DIRECT | INITIAL`), solicitante, decisor, fechas, motivo del solicitante, comentario de la decisión, **costo total unitario del momento** (`cost_snapshot`, visible solo con `costs:read`) y el lote de la decisión (`batch_id`).

La base de datos impone: precios ≥ 0 y distintos; coherencia estado/decisión; `ADMIN_DIRECT` e `INITIAL` nacen aprobados por quien los registra; solo el solicitante cancela; rechazar exige comentario; **una pendiente por variante**; y un **trigger** que impide borrar y modificar un cambio ya resuelto (de una pendiente solo permite resolverla).

Aprobar actualiza `sale_price`, `price_changes` y la auditoría (`variant.price_changed`, `price.approved`/`price.rejected`/`price.cancelled`/`price.requested`) en **la misma transacción**. El cálculo de la ganancia (`computeProfit`, `packages/shared/src/pricing.ts`) usa aritmética entera exacta y es el mismo en API e interfaz.

### 5. Ganancia visible (Q-06)

Solo con `costs:read`, junto al precio vigente y al nuevo: **ganancia en Bs** `(precio − costo total)` y **% sobre el costo total** `(precio − costo) / costo`; con costo 0 el porcentaje es «—». Una ganancia negativa se advierte («Precio menor al costo»), no se bloquea: el cliente decide.

## Alternativas consideradas

- **Multiplicador y redondeo por categoría o producto (propuesta inicial, trabajo de Codex):** descartado por el cliente; el precio varía ítem a ítem.
- **Tabla de propuestas solo para las solicitudes y cambio directo sin historial:** perdería la trazabilidad de los precios fijados por el Administrador y los iniciales.
- **Auditoría como único historial:** no permite consultar por variante con estado, decisor y costo del momento.
- **Aprobación automática bajo un umbral:** el cliente pidió explícitamente no tener umbrales.

## Consecuencias

- El permiso `prices:manage` desaparece; lo reemplazan `prices:propose` y `prices:approve` (el seed los agrega a los roles; hay que volver a ejecutarlo en bases existentes).
- Precios existentes sin historial: el primer cambio registra el precio vigente como «anterior»; no se inventan filas retroactivas.
- Abierto para otras fases: bandeja global «Pendientes de aprobación» con contador en el inicio del Administrador (Q-14; el endpoint `GET /pricing/pending-count` ya existe) y vendibilidad por precio (Fase 2).

## Actualización 2026-11-05: regla de autorización compartida

El cliente fijó, después de las decisiones Q-01 B y D4 y para evitar bloqueos, que **tanto el Administrador
como el Responsable de inventario pueden autorizar** ([RESOLUCIONES-2026-11-05](../business/RESOLUCIONES-2026-11-05.md),
regla de autorización compartida). Efecto sobre este ADR (el texto anterior no se reescribe):

- `prices:approve` lo tienen ahora el Administrador **y** el Responsable de inventario: ambos aprueban o
  rechazan solicitudes (uno o en masa), cambian precios directamente y fijan el precio inicial al crear una
  pieza o variante. Donde arriba dice «el Administrador decide» o «solo el Administrador», léase «quien tiene
  `prices:approve`».
- El Responsable puede aprobar sus propias solicitudes; no hay segregación obligatoria (riesgo aceptado,
  trazable por auditoría: P-43). La regla «una solicitud pendiente por variante» no cambia.
- El flujo **solicitar → aprobar** sigue para roles con solo `prices:propose`.
- El origen `ADMIN_DIRECT` conserva su valor en el enum y la base, pero su etiqueta visible pasa a ser
  **«Cambio directo (con autorización)»**, porque ya no lo registra únicamente el Administrador.

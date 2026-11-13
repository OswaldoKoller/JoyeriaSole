# ADR-023: Caja única, arqueo y correcciones append-only

- **Estado:** Aceptado (autorización del responsable del 2026-11-10, ver
  [RESOLUCIONES-2026-11-10](../business/RESOLUCIONES-2026-11-10.md))
- **Fecha:** 2026-11-11
- **Equivalencia:** es el «ADR-028» citado en los documentos de análisis de
  [`docs/propuestas/fase-2-ventas`](../propuestas/fase-2-ventas/11-plan-de-implementacion.md) (§10).

## Contexto

DEC-V09 (resolución 2026-11-07 §3) y las respuestas B1 a B9 del 2026-11-09 piden una caja lógica única
con apertura, cobros, cierre y arqueo: no se vende sin caja abierta; fondo inicial obligatorio en cada
apertura; toda diferencia con observación obligatoria, sin tolerancia; sin gastos ni retiros (B6); sin
reapertura (B7); QR y transferencia informados aparte (B8). La aclaración de B6/B7 delega que solo el
Administrador corrija errores de captura de un cierre por una vía que no toque la sesión, las ventas
ni los pagos ([documento 10](../propuestas/fase-2-ventas/10-correcciones-de-caja.md)).

## Decisión

1. **Una sola sesión abierta garantizada en la base:** índice único parcial
   `cash_sessions_single_open_idx (status) WHERE status = 'OPEN'`. Una apertura simultánea choca con
   el índice y la API responde 409 `CASH_SESSION_ALREADY_OPEN`.
2. **Toda venta pertenece a una sesión abierta:** `sales.cash_session_id NOT NULL` y trigger
   `sales_require_open_session`. La venta toma `FOR SHARE` sobre la sesión; el cierre toma
   `FOR UPDATE`, espera a las ventas en curso (máximo 5 s con `lock_timeout`; luego 503 con
   `Retry-After`) y las incluye; una venta posterior recibe 422 `CASH_SESSION_REQUIRED`.
3. **Esperado calculado y congelado:** esperado = fondo + Σ pagos en efectivo **aplicados** (netos de
   vuelto) + movimientos (siempre 0). Al cerrar se congelan `cash_sales_total`, `expected_cash`,
   `counted_cash` y `difference`; CHECK verifican la aritmética y el trigger `cash_sessions_guard`
   **recalcula** los cobros en efectivo. Diferencia ≠ 0 sin observación → 422
   `CASH_DIFFERENCE_NOTE_REQUIRED` (y CHECK en la base).
4. **Cierre idempotente** (`Idempotency-Key` obligatoria, guardada en `close_request_id` con su hash):
   misma clave → misma respuesta; otra clave sobre una sesión cerrada → 409 `CASH_SESSION_CLOSED`.
5. **Sesión cerrada inmutable** (sin reapertura, sin `DELETE`).
6. **Correcciones append-only** en `cash_session_corrections`: tipos cerrados `COUNTED_CASH`,
   `OPENING_AMOUNT` y `NOTE` (AE-1); sin columnas hacia ventas, pagos o medios (AE-2); valor anterior
   esperado (409 `CASH_CORRECTION_CONFLICT` si cambió); cifras vigentes recalculadas por el servidor y
   validadas por trigger con los cobros congelados (AE-4); motivo ≥ 10 caracteres; auditoría
   `before/after`. La sesión original no cambia: se muestran cifras originales y vigentes y la marca
   «Corregida (N)».
7. **Permisos:** abren y cierran Administrador y Responsable (`cash:open`, `cash:close`); `cash:read`
   a ambos; `cash:correct` **exclusivo del Administrador** y no asignable a otro rol por la pantalla
   «Roles» (la API lo rechaza).

## Alternativas consideradas

Las opciones A a F del documento 10 §3: reabrir la sesión (contradice B7), editar el cierre
(reescribe el original), anular y rehacer el cierre (equivale a reapertura), corregir por ajuste de
inventario o venta compensatoria (anulación encubierta, DEC-V07), sin vía de corrección (deja errores
de digitación sin cauce). Se eligió la tabla append-only con controles AE-1 a AE-13.

## Consecuencias

- No hay gastos, retiros, reapertura, tolerancia, conteo por denominaciones ni arqueo ciego (fuera).
- Un Administrador puede corregir su propio cierre (SC-2) y no hay plazo (SC-1): quedan como valores
  por defecto pendientes de confirmación.
- El riesgo de que un Administrador oculte un faltante subiendo el contado queda a la vista (cifra
  original, auditoría) pero no se impide; depende de la revisión periódica (SC-4).

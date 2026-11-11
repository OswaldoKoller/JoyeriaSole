# ADR-022: Venta de mostrador atómica, idempotente e inmutable

- **Estado:** Aceptado (autorización del responsable del 2026-11-10, ver
  [RESOLUCIONES-2026-11-10](../business/RESOLUCIONES-2026-11-10.md))
- **Fecha:** 2026-11-11
- **Equivalencia:** es el «ADR-024» citado en los documentos de análisis de
  [`docs/propuestas/fase-2-ventas`](../propuestas/fase-2-ventas/11-plan-de-implementacion.md) (§10).

## Contexto

La Fase 2 agrega la venta de mostrador con comprobante interno (Q-V01). El responsable decidió
(DEC-V07, resolución 2026-11-07 §2) que **una venta confirmada no se anula, no se borra y no se
modifica**, ni por mecanismos equivalentes o encubiertos, y que los errores se previenen antes de
confirmar (revisión previa, validación de stock y pagos, idempotencia, transacción atómica). El stock
solo cambia mediante el libro de movimientos (ADR-007) y la auditoría va en la misma transacción
(ADR-010).

## Decisión

1. **Sin estado.** `sales` no tiene columna `status` ni campos de anulación: una venta existe solo si
   se confirmó. No hay rutas `PATCH`, `PUT` ni `DELETE` bajo `/sales`, ni permiso, movimiento o
   estado de anulación. Una guarda estática (`apps/api/test/unit/no-sale-void-guard.test.ts`) falla si
   aparecen esos símbolos en el código, el esquema, las migraciones, el paquete compartido o la web.
2. **Inmutable en la base.** Triggers rechazan todo `UPDATE`/`DELETE` en `sales`, `sale_items`,
   `sale_payments` y `sale_receipt_prints`. Triggers de restricción **diferidos** exigen al `COMMIT`
   ≥ 1 línea, ≥ 1 pago y Σ líneas = total = Σ pagos (también impiden agregar líneas o pagos después) y
   que cada línea apunte a su movimiento `SALE`. Un trigger exige sesión de caja `OPEN`.
3. **Snapshots.** Cada línea guarda precio, costo (`unit_cost_snapshot`, nunca expuesto por la API de
   ventas), SKU, producto y etiqueta; cada pago guarda el nombre del medio; la venta guarda el nombre
   del vendedor. El comprobante se proyecta de esas filas (ADR-024).
4. **Stock solo por el libro.** La venta descuenta con `applyStockChanges` (módulo de inventario)
   usando el tipo existente `SALE` (cantidad negativa, `reference_type = 'SALE'`, `reference_id` = id
   de la venta). No se agregan valores al enum de movimientos. CHECK `SALE → quantity < 0`.
5. **Idempotencia obligatoria.** `POST /sales` exige `Idempotency-Key`. La clave se reclama primero en
   `idempotency_keys` (E0) y además se guarda en `sales.client_request_id` (UNIQUE) con el hash del
   cuerpo: misma clave y cuerpo → la misma venta (también tras cerrar la caja o vencer la clave
   genérica); otra clave o cuerpo → 409. El hash no incluye la sesión, la hora ni el usuario.
6. **Orden global de bloqueos** (§3.12 del plan): sesión de caja (`FOR SHARE` en la venta,
   `FOR UPDATE` en cierre y corrección) → variantes por id → saldos por id de variante. Ingresos,
   ajustes, conteos y cambios nunca bloquean la sesión: no hay ciclos. `READ COMMITTED`.
7. **Validación con datos vigentes bajo bloqueo:** variante y producto activos y con precio > 0
   (422 `VARIANT_NOT_SELLABLE`), precio y total esperados (409 `PRICE_CHANGED`), stock (422
   `INSUFFICIENT_STOCK`), pagos solo en Bs pagados íntegramente, vuelto solo en efectivo (422
   `PAYMENT_MISMATCH`).
8. **Venta errónea:** se registra una **incidencia** de solo trazabilidad (`sale_incidents`), sin
   efecto en stock, importes, pagos ni caja; el desfase de stock se regulariza en el conteo ordinario
   (ADR-021). No hay ajuste, cambio inverso, pago negativo, corrección de caja ni venta compensatoria.

## Alternativas consideradas

- **Estado con anulación** (`COMPLETED`/anulada, movimiento inverso): descartada por DEC-V07.
- **Insertar la venta antes de bloquear variantes** (documento 03 §8.1): descartada porque `total` es
  `NOT NULL` e inmutable y depende de precios leídos bajo bloqueo; la venta se inserta después del
  libro y la idempotencia la cubren la clave genérica, la repetición bajo bloqueo y el índice único.
- **Clave de idempotencia en el cuerpo** (`clientRequestId`, documentos 02/03/10): sustituida por la
  cabecera del helper genérico; las columnas de dominio conservan el nombre.
- **Vuelto como pago negativo:** descartada (importes siempre > 0; vuelto = recibido − aplicado).

## Consecuencias

- Un error de venta es permanente por diseño (RK-01): la prevención (revisión previa en la web) es
  crítica. Las incidencias dejan constancia; la corrección real ocurre fuera del sistema o en el conteo.
- Las pruebas no pueden insertar una venta suelta: venta, líneas y pagos van en una transacción.
- Los números consumidos por intentos revertidos dejan saltos (aceptado, R-20).
- `TRUNCATE` no se cubre con triggers: se revoca en producción (D3).

Notas a ADR-017 y ADR-019 (sin editarlos): los ajustes y los cambios de pieza **no** se usan para
corregir ventas (C5).

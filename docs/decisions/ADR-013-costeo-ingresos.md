# ADR-013: Prorrateo por valor y último costo

- **Estado:** Aceptado (decisión del cliente del 2026-10-11)
- **Fecha:** 2026-10-11
- **Complementa:** [ADR-008](ADR-008-stock-entries-costs.md), cuyo método de costeo estaba pendiente.

## Contexto

Un ingreso registra costo de compra por ítem y costos de transporte, embolsado y otros a nivel del documento. La confirmación debe fijar el costo unitario y aumentar stock de forma atómica.

## Decisión

- Repartir los costos adicionales **en proporción al valor de compra de cada ítem** (`receivedQty × unitCost`).
- Guardar el costo adicional unitario resultante en cada ítem; el costo unitario total se conserva en el movimiento de ingreso y pasa a ser el **último costo** de la variante.
- No modificar el precio de venta al confirmar el ingreso antes de definir la aprobación P-25. El precio base de P-03 puede calcularse como propuesta, nunca publicarse sin ese flujo.
- La política exacta de redondeo y de reparto de residuos de centavos requiere definición antes de cerrar la confirmación monetaria. La suma asignada debe igualar el total de costos adicionales.

## Consecuencias

- Reconfirmar un ingreso no puede duplicar stock ni costo.
- Un ingreso con valor de compra total cero exige una regla explícita de tratamiento antes de aplicar el prorrateo; no se divide entre cero ni se asigna un reparto supuesto.
- Costos y saldos deben actualizarse en la misma transacción que movimientos y auditoría.

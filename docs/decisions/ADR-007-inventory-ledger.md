# ADR-007: Inventario como libro de movimientos

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Contexto

El stock no debe modificarse arbitrariamente y cada cambio debe ser auditable (tipo, cantidad, fecha,
usuario, variante, referencia, motivo, observación).

## Decisión

- `inventory_movements`: libro **append-only** con cantidad con signo, `balance_before`,
  `balance_after`, costo unitario, `reference_type`/`reference_id` al documento origen, motivo, notas,
  usuario y fecha. Un trigger impide UPDATE/DELETE; un CHECK garantiza
  `balance_after = balance_before + quantity`.
- `inventory_balances`: saldo actual por variante, actualizado **en la misma transacción** que el
  movimiento, bloqueando la fila (`SELECT ... FOR UPDATE` o `UPDATE ... RETURNING`) para evitar
  condiciones de carrera.
- Un único servicio de inventario es el único código autorizado a escribir en ambas tablas.
- Las correcciones se hacen con movimientos compensatorios, nunca editando.

## Alternativas consideradas

- Un campo `stock` editable: sin trazabilidad.
- Solo movimientos, calculando el saldo con `SUM` en cada consulta: correcto pero lento al crecer.
  El saldo materializado se verifica contra la suma en pruebas y conciliaciones.

## Consecuencias

- Historial completo y reconstruible.
- Stock negativo: PENDIENTE P-08 (no restringido en BD).
- Multi-sucursal futura: agregar `location_id` a ambas tablas.

# ADR-014: Conteos físicos con movimientos concurrentes

- **Estado:** Aceptado parcialmente (tratamiento de movimientos aprobado el 2026-10-11; alcance pendiente)
- **Fecha:** 2026-10-11
- **Complementa:** [ADR-009](ADR-009-physical-counts.md), que dejó abierto P-13.

## Contexto

La tienda debe continuar operando mientras se cuentan piezas. El saldo puede variar entre el snapshot, el registro de la cantidad física y la aprobación.

## Decisión

- No bloquear ingresos ni otros movimientos durante el conteo.
- Registrar el momento de cada cantidad contada y conciliar los movimientos posteriores que afectaron esa variante antes de calcular el ajuste al aprobar.
- Aprobar con el saldo vigente bloqueado dentro de una transacción; el movimiento `COUNT_ADJUSTMENT`, el saldo y la auditoría se escriben juntos. Evitar aplicar una diferencia calculada solo contra el snapshot inicial.
- El responsable de inventario puede aprobar su propio conteo y sus ajustes (P-01).

## Pendiente

Definir si el conteo se inicia para todo el inventario, una categoría u otra agrupación. Esa decisión determina qué variantes se incluyen en el snapshot y en la revisión.

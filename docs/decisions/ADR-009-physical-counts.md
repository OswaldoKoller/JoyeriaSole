# ADR-009: Inventario físico

- **Estado:** Aceptado (alcance y aprobador PENDIENTES P-01, P-13)
- **Fecha:** 2026-10-06

## Decisión

- `inventory_counts` con estados `DRAFT → IN_PROGRESS → IN_REVIEW → APPROVED | CANCELLED`.
- Al iniciar se toma un **snapshot** del stock del sistema por variante (`system_qty`).
- Conteo por ítem registrando quién y cuándo; la diferencia es `counted_qty − system_qty`.
- Solo la **aprobación** (permiso `inventory-counts:approve`) genera movimientos `COUNT_ADJUSTMENT`, y
  exige motivo para cada diferencia. El movimiento registra cantidad anterior, nueva, diferencia,
  motivo, observación, usuario y fecha.

## Consecuencias

- No existen ajustes sin documento ni autorización.
- Los movimientos ocurridos durante el conteo se tratarán según P-13.

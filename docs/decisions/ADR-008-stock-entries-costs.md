# ADR-008: Ingresos de mercadería y costos

- **Estado:** Aceptado (método de prorrateo y de costeo PENDIENTE P-07)
- **Fecha:** 2026-10-06

## Decisión

- Documento `stock_entries` con estados `DRAFT → CONFIRMED | CANCELLED` e ítems `stock_entry_items`
  (cantidad esperada opcional vs. recibida, costo unitario de compra).
- **El stock solo cambia al confirmar.** La confirmación, en una transacción, genera un movimiento
  `STOCK_ENTRY` por ítem, actualiza saldos, fija `unit_extra_cost` y el costo vigente de la variante,
  y escribe auditoría. Requiere `stock-entries:confirm`.
- Los costos adicionales (transporte, embalaje, otros) se registran a nivel de ingreso y se prorratean
  a los ítems al confirmar, con el método que se apruebe (P-07).
- El precio de venta se guarda explícito por variante. La regla "costo × 2" **no** se implementa
  hasta su confirmación (P-03); si se aprueba, será una sugerencia que admite excepciones.

## Consecuencias

- Un ingreso confirmado es inmutable; las correcciones son ajustes trazables.
- Se conserva el costo de cada entrada en su movimiento (base para valorización y reportes futuros).

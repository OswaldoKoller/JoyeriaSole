---
name: inventory-domain
description: Reglas del dominio de inventario de Joyería Sole — producto vs variante, atributos, SKU/códigos de barras, movimientos de stock, ingresos de mercadería, costos/precios e inventario físico, con las decisiones pendientes. Usar antes de implementar o modificar cualquier lógica de catálogo, stock, ingresos o conteos.
---

# Dominio de inventario

Referencias: `docs/business/DOMINIO.md`, `docs/business/PENDIENTES.md`, ADR-001, 006, 007, 008, 009.

## Reglas confirmadas (implementables)

1. **Stock por variante.** `products` no tiene stock. Todo producto tiene ≥ 1 variante.
2. **Variante** = SKU único + barcode único opcional + costo + precio + stock mínimo + estado.
3. **Ejes de variante** = atributos OPTION en `product_variant_axes`; cada variante tiene un valor por
   eje; la combinación es única dentro del producto (validar en servicio → `ConflictError`).
4. **Movimientos**: todo cambio de stock inserta en `inventory_movements` (cantidad con signo,
   `balance_before`, `balance_after`, tipo, referencia, motivo, notas, usuario) y actualiza
   `inventory_balances` en la **misma transacción** con la fila bloqueada. Nunca editar/borrar
   movimientos; corregir con otro movimiento.
5. **Ingreso**: `DRAFT` editable sin efecto en stock → `CONFIRMED` (genera `STOCK_ENTRY` por ítem con
   `receivedQty`, fija costos, audita) → inmutable. `CANCELLED` solo desde `DRAFT`. Confirmar dos
   veces debe fallar con `BusinessRuleError`.
6. **Inventario físico**: snapshot `system_qty` al iniciar; conteo; revisión; solo la aprobación crea
   `COUNT_ADJUSTMENT` por cada diferencia con motivo obligatorio.
7. **Ajustes** manuales (ADR-017): el Responsable o el Administrador solicitan (`inventory:adjust`) y ambos pueden aprobar (`inventory:adjust-approve`, regla 2026-11-05); el stock cambia únicamente al aprobar, con motivo del catálogo, sin stock negativo (revalidado al aprobar) y auditados. Toda escritura de stock usa `applyStockChanges` (`modules/inventory/stock-ledger.ts`).
8. **Auditoría** de: cambios de producto/variante, desactivaciones, cambios de costo/precio (antes →
   después), confirmaciones, cancelaciones, ajustes, aprobaciones.
9. **Lector de códigos**: entrada de teclado; búsqueda por `barcode` exacto y luego `sku` exacto.

## PENDIENTES — no implementar sin aprobación

**Actualización 2026-10-09:** consultar `docs/business/PENDIENTES.md` y `docs/business/RESOLUCIONES-2026-10-09.md` antes de usar esta tabla histórica. P-05, P-08, P-09, P-20 y P-22 ya tienen respuesta aprobada; P-01, P-06, P-13 y P-24 tienen respuesta parcial. Una decisión aprobada no significa que el servicio ya la haga cumplir.

| ID        | Tema                                               | Qué hacer mientras tanto                                              |
| --------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| P-03      | Precio = costo total × 2                           | **No calcular.** El precio se ingresa explícitamente.                 |
| P-05      | Formato de SKU                                     | Campo libre validado como único. No generar automáticamente.          |
| P-06      | Barcode/QR propios vs. proveedor                   | Barcode opcional y único; no generar etiquetas.                       |
| P-07      | Prorrateo de costos adicionales y método de costeo | No implementar la confirmación con costos hasta definirlo; preguntar. |
| P-08      | Stock negativo                                     | Preguntar antes de implementar salidas/ajustes negativos.             |
| P-09      | Unidades no enteras                                | Solo enteros.                                                         |
| P-13      | Alcance/bloqueo en conteos                         | Preguntar antes de implementar el inicio de un conteo.                |
| P-01/P-02 | Quién aprueba / quién ve costos                    | Usar permisos; no cambiar asignaciones del seed.                      |
| P-20      | Catálogo de motivos                                | Texto libre obligatorio.                                              |
| P-22      | Desactivar con stock                               | Preguntar.                                                            |
| P-24      | Productos nuevos en un ingreso                     | Estado `DRAFT` disponible; preguntar el flujo.                        |

Si la tarea toca uno de estos puntos: **detenerse, explicar las alternativas de PENDIENTES.md y pedir decisión.**

## Tipos de movimiento

`INITIAL_STOCK`, `STOCK_ENTRY`, `ADJUSTMENT`, `COUNT_ADJUSTMENT`, `LOSS` (Fase 1).
`EXCHANGE_IN` / `EXCHANGE_OUT`: cambios de pieza, un solo `applyStockChanges` con dos líneas (ADR-019); no hay devoluciones. `SALE`, `CUSTOMER_RETURN`, `EXCHANGE`: reservados, **no usar** en Fase 1.

## Consultas de control

- Sin stock: `inventory_balances.quantity = 0` (incluir variantes activas sin fila de saldo como 0).
- Bajo mínimo: `quantity <= min_stock AND min_stock > 0`.
- Historial: `inventory_movements` por `variant_id, created_at` (índice existente).

## Tests obligatorios para lógica de stock

- Saldo final = suma de movimientos de la variante.
- Operación fallida a mitad → sin movimiento, sin cambio de saldo, sin auditoría.
- Dos confirmaciones/ajustes concurrentes sobre la misma variante no pierden cantidades.

# ADR-016: Compras en dólares y costos de importación

- **Estado:** Aceptado (decisiones del cliente del 2026-11-05: C1–C7, C10, Q-06, Q-07 A, Q-08 A)
- **Fecha:** 2026-11-06
- **Amplía:** [ADR-008](ADR-008-stock-entries-costs.md), [ADR-013](ADR-013-costeo-ingresos.md) y [ADR-015](ADR-015-reparto-centavos-y-valor-cero.md). Las reglas de reparto de ADR-013/015 **no cambian**: ahora se aplican sobre el valor ya convertido a bolivianos.

## Contexto

El cliente compra mercadería en el exterior en **dólares** y paga costos de importación (aduanización, comisiones, transporte…). Necesita ver el costo real de cada pieza «en base a todo» para decidir su precio de venta a mano (Q-04/Q-05). Hasta ahora un ingreso solo admitía bolivianos y tres costos fijos (transporte, embolsado, otros).

## Decisión

### 1. Moneda y tipo de cambio por ingreso

- Cada ingreso declara su **moneda de compra**: `BOB` o `USD` (solo dólares; no yuanes). La moneda habitual del proveedor (`suppliers.default_currency`) solo se **sugiere** al crear el ingreso.
- En `USD` el **tipo de cambio** (bolivianos por dólar) es obligatorio, manual, **mayor que cero**, con **hasta 4 decimales** y hasta 4 cifras enteras. En `BOB` no se admite tipo de cambio. La base lo exige con un `CHECK`.
- El tipo de cambio es **del ingreso**: se puede cambiar mientras sea borrador (los costos en Bs de los ítems se recalculan) y **queda fijo al confirmar**.
- Los precios de compra de los ítems se digitan **en la moneda del ingreso**. Costos, stock y precios de venta del sistema se llevan siempre en **bolivianos**.

### 2. Conversión USD → Bs y redondeo

Por cada ítem, con aritmética entera exacta (`BigInt`, sin coma flotante):

```
costo unitario en Bs = redondeo_mitad_arriba_a_4_decimales( precio unitario en USD × tipo de cambio )
valor del ítem en Bs = cantidad recibida × costo unitario en Bs        (exacto: no se vuelve a redondear)
```

- El redondeo ocurre **una sola vez, sobre el costo unitario**, antes de multiplicar por la cantidad. Así el costo unitario guardado (4 decimales, como en ADR-015) multiplicado por la cantidad es exactamente el valor que se usa para repartir, y API e interfaz calculan lo mismo.
- Ejemplo: 0,1111 USD × 6,96 = 0,773256 → **0,7733 Bs**; 7 piezas = **5,4131 Bs** (no 5,412792).
- Un precio o costo convertido que no cabe en `Decimal(12,4)` (99 999 999,9999) se rechaza (`400`); no se trunca.

### 3. Costos adicionales: lista abierta en Bs

- Los tres campos fijos se reemplazan por una **lista abierta de líneas** (`stock_entry_costs`): tipo + **monto en Bs** (> 0, no porcentaje) + nota opcional. Se pueden repetir tipos.
- Los tipos salen de un **catálogo** (`stock_entry_cost_types`): Transporte, Embolsado, Aduanización, Comisiones y Otro (sembrados, `is_system`, no editables) más los que agregue el Administrador con el permiso nuevo `settings:manage`. Un tipo desactivado deja de ofrecerse, pero se conserva en los ingresos que ya lo usan.
- **Migración de datos:** cada columna antigua con monto mayor que cero (`freight_cost`, `packaging_cost`, `other_costs`, también en ingresos confirmados) se convierte en una línea de tipo Transporte / Embolsado / Otro («Valores extras (migrado)»); luego se eliminan las columnas. La suma por ingreso se conserva exactamente.

### 4. Prorrateo sobre el valor convertido

- Los costos adicionales se reparten **por valor de compra en Bs** con el reparto exacto de centavos por mayor resto de ADR-015. La suma de las partes asignadas a los ítems es **igual al total de costos adicionales**.
- Costo unitario total = costo unitario en Bs + costo adicional por pieza (parte ÷ cantidad, 4 decimales, mitad hacia arriba). Es el **último costo** de la variante (P-07 / ADR-013).
- Con costos adicionales y valor de compra cero **no se confirma** (ADR-015, sin cambios). Si falta el tipo de cambio en un ingreso en USD tampoco.

### 5. Qué se conserva en cada ítem

| Campo (`stock_entry_items`) | Contenido                                                                      |
| --------------------------- | ------------------------------------------------------------------------------ |
| `unit_price`                | Precio de compra unitario original, en la moneda del ingreso.                  |
| `unit_cost`                 | Costo unitario de compra en Bs (conversión de arriba). Antes: único costo.     |
| `extra_cost_allocated`      | Parte de los costos adicionales asignada al ítem, en Bs (centavos exactos).    |
| `unit_extra_cost`           | Costo adicional por pieza (4 decimales).                                       |
| `total_cost`                | Costo total del ítem = `cantidad × unit_cost` + `extra_cost_allocated`.        |
| `difference_reason`         | Justificación de la diferencia esperado/recibido (obligatoria para confirmar). |

`extra_cost_allocated`, `unit_extra_cost` y `total_cost` se fijan al confirmar. `costo unitario total × cantidad` puede diferir de `total_cost` en una fracción de centavo por el redondeo a 4 decimales del costo unitario (ya anotado en ADR-015); `total_cost` es el valor exacto del ítem.

En los ingresos confirmados **antes** de esta versión, `extra_cost_allocated` y `total_cost` se **reconstruyen** desde el costo adicional unitario (el reparto exacto en centavos de entonces no se guardó por ítem); el costo unitario, que es lo vigente, no cambia.

### 6. Reglas del flujo que acompañan a la importación

- **Diferencias (C2):** si la cantidad esperada difiere de la recibida, la justificación es obligatoria para confirmar.
- **Fecha del documento (C6):** no futura y no anterior a 30 días respecto de «hoy» en `America/La_Paz`; se valida al guardar (en una edición solo si la fecha cambia). La fecha de auditoría es siempre la real.
- **Entregas parciales (C5):** el número de comprobante puede repetirse (sin unicidad); el detalle muestra los otros ingresos del mismo proveedor y comprobante.
- **Confirmación (C3/C4):** quien registra puede confirmar; un ingreso confirmado no se anula ni edita (ni su tipo de cambio): las correcciones son ajustes.
- **Alta rápida de pieza nueva (C1/P-24):** categoría, nombre, costo y cantidad (código del proveedor opcional) crean, en una transacción con auditoría, un producto `ACTIVE` con ficha incompleta, una variante con SKU correlativo y precio de venta 0, y el ítem del borrador. El código del proveedor se guarda en `supplier_products` y, si no choca con otro código de barras o SKU, como código de barras; si choca, solo se avisa (Q-10b).
- **Visibilidad de costos:** precios, tipo de cambio, costos y totales solo con `costs:read`. Sin él, las respuestas de lectura devuelven esos campos en `null` y las operaciones que cargan costos devuelven `403`.
- **Historial de costos (C10):** se obtiene de los ítems de ingresos confirmados, sin tabla nueva (`GET /products/variants/:id/cost-history`).

## Alternativas consideradas

- **Redondear el valor de la línea (cantidad × precio × tipo de cambio) a centavos:** el costo unitario guardado no reproduciría el valor usado en el reparto.
- **Convertir los costos adicionales a USD:** el cliente los paga en bolivianos (Q-08); se mantienen en Bs.
- **Tabla de tipos de cambio por fecha / cotización oficial automática:** fuera de alcance; el cliente fija el tipo de cambio de cada ingreso a mano (Q-07).
- **Mantener las tres columnas y agregar dos más:** la lista de costos es abierta por decisión del cliente.
- **Multimoneda general (yuanes, euros):** no solicitado; el modelo (`stock_entry_currency`) permite ampliar la lista más adelante.

## Consecuencias

- Con tipo de cambio 0,0001 y precios mínimos el costo convertido puede ser 0: es válido y se trata como valor cero (ADR-015).
- La web y la API comparten `computeEntryCosts` (`packages/shared/src/costing.ts`): la vista previa antes de confirmar coincide con lo que se guarda.
- Un cambio de tipo de cambio en un borrador recalcula `unit_cost` de todos los ítems en la misma transacción.
- Abre una **decisión pendiente** (ver PENDIENTES P-10): redondeo del equivalente en Bs al mostrar totales (se redondea a centavos con mitad hacia arriba solo para mostrar) y si el cliente quiere más monedas.

# ADR-019: Cambios de pieza como doble movimiento atómico

- **Estado:** Aceptado (usa el libro de [ADR-007](ADR-007-inventory-ledger.md) y la operación genérica de [ADR-017](ADR-017-ajustes-solicitud-aprobacion.md); costos según [ADR-013](ADR-013-costeo-ingresos.md) y [ADR-015](ADR-015-reparto-centavos-y-valor-cero.md))
- **Fecha:** 2026-11-05

## Contexto

El cliente aclaró en la reunión del 2026-11-05 (C9, Q-12 A, 12.1 A):

- **No hay devoluciones, solo cambios.** Cuando un cliente trae una pieza, se le entrega otra en su lugar.
- La pieza que vuelve en un cambio **reingresa al stock vendible** (12.1 A).
- El futuro módulo de ventas debe poder registrar cambios **sin descuadrar** inventario, stock, conteos
  ni ajustes.
- El punto de venta no es de la Fase 1: en esta fase solo se construye la **base** del dominio y de la
  API, sin pantallas de registro.

El enum `movement_type` ya traía tres valores reservados para ventas (`SALE`, `CUSTOMER_RETURN`,
`EXCHANGE`) que no se usan. Un único `EXCHANGE` no basta: un cambio mueve **dos** variantes en sentidos
opuestos y los reportes (kardex, valorización, conteos) necesitan saber cuál entra y cuál sale.

## Decisión

1. **Dos tipos de movimiento nuevos:** `EXCHANGE_IN` (entra al stock la pieza devuelta por el cliente,
   cantidad positiva) y `EXCHANGE_OUT` (sale del stock la pieza entregada en su lugar, cantidad
   negativa). Se agregan al enum con una migración que solo hace `ALTER TYPE … ADD VALUE` (un valor
   nuevo de enum no puede usarse en la misma transacción que lo crea). No hay CHECK de signo por tipo
   en `inventory_movements`; basta `quantity <> 0` y `balance_after = balance_before + quantity`.
   Los valores reservados `EXCHANGE` y `CUSTOMER_RETURN` quedan sin uso (PostgreSQL no permite quitar
   valores de un enum): **no existen devoluciones puras**.
2. **Una sola operación atómica** en `modules/inventory` (único módulo que escribe movimientos,
   ADR-007): `ExchangesService.create` bloquea las dos variantes y llama **una vez** a
   `applyStockChanges` con **dos líneas** (entrada + salida) dentro de la misma transacción. Si la
   salida dejara el saldo negativo, se lanza `BusinessRuleError` (422) y **se revierte todo**,
   incluida la entrada. Ambos movimientos comparten `reference_type = 'EXCHANGE'` y un `reference_id`
   común (UUID generado por el servidor para el cambio), el mismo motivo, la misma observación y el
   mismo usuario.
3. **Reglas de entrada:** motivo obligatorio (hasta 200 caracteres), observación opcional; cantidades
   enteras ≥ 1 (hasta 1 000 000) en cada lado, que pueden ser distintas (un anillo por dos aretes);
   variantes distintas (misma variante en ambos lados → 422); variantes y productos activos (inactivas
   → 422; inexistentes → 404). La API no verifica que el valor de las piezas sea parecido: la
   equivalencia comercial del cambio es del vendedor (y de la venta futura), no del inventario.
4. **Costos.** Cada movimiento guarda el **costo unitario vigente de la variante** (`cost_price`) al
   momento del cambio, solo informativo (como en los ajustes). **Un cambio no recalcula el costo de
   ninguna variante**: el sistema solo cambia el último costo al confirmar un ingreso (ADR-013). La
   pieza devuelta vuelve al stock al costo vigente de su variante. Si el cliente quisiera un costo
   promedio ponderado, sería otra decisión (P-07).
5. **Permiso nuevo `inventory:exchange`** para Administrador y Responsable de inventario. El Vendedor
   **no** lo tiene, aunque en el futuro punto de venta probablemente lo necesite: quién registra los
   cambios queda como decisión pendiente (P-30). Consultar un cambio exige `inventory:read`.
6. **API.** `POST /api/v1/inventory/exchanges` (201) y `GET /api/v1/inventory/exchanges/:referenceId`
   devuelven ambos movimientos (variante, SKU, cantidad con signo, saldo antes y después). Los costos
   solo con `costs:read` (si no, `null`); la auditoría del cambio solo con `inventory:exchange` o
   `audit:read` (si no, `null`).
7. **Auditoría.** `inventory.exchange` (entidad `InventoryExchange`, id = `reference_id`) en la misma
   transacción, con motivo, observación, quién, y por cada lado variante, SKU, cantidad, saldo antes y
   después e id del movimiento. Sin costos (la auditoría la lee quien no necesariamente ve costos).
8. **Historial y kardex.** Los movimientos aparecen en el kardex por variante y en el historial global
   con las etiquetas «Cambio: entrada de pieza devuelta» y «Cambio: salida de pieza entregada»
   (`MOVEMENT_TYPE_LABELS` en `@joyeria/shared`, que ahora es la única fuente de etiquetas). Los
   filtros y reportes que leen el libro trabajan con la cantidad con signo y el saldo, por lo que no
   necesitan conocer los tipos nuevos; los conteos (ADR-014/021) concilian por movimientos posteriores
   a la captura sin mirar el tipo.

## Límites (qué NO hace)

- No hay pantallas de registro ni punto de venta: solo la base y la API.
- No hay devoluciones, reembolsos ni notas de crédito (C9).
- No hay venta asociada: el cambio no referencia un documento de venta (no existe en Fase 1). Cuando se
  construya, deberá guardar `reference_id` del cambio en la venta o crear el cambio desde ella.
- No se anula ni edita un cambio: los movimientos son de solo agregar (ADR-007). Un error se corrige con
  un cambio inverso o un ajuste aprobado.
- No decide si la pieza devuelta está en condiciones de venderse: 12.1 A dice que vuelve al stock
  vendible; una pieza dañada se ajusta como «Rotura» después.

## Alternativas consideradas

- **Dos llamadas independientes** (una entrada y una salida como ajustes): pueden fallar a medias y dejar
  el stock descuadrado; sin documento común no se puede reconstruir el cambio.
- **Un único tipo `EXCHANGE` con cantidad con signo:** el kardex no distinguiría entrada de salida sin
  mirar el signo y se reutilizaría un valor pensado como reservado sin acordar su semántica.
- **Modelar el cambio como devolución + venta:** C9 dice que no hay devoluciones; además dejaría
  stock y dinero en pasos separados y rompería la atomicidad.
- **Tabla `inventory_exchanges` propia:** útil para un historial con filtros, pero hoy basta
  `reference_type/reference_id`. Se crea junto con el módulo de ventas si hace falta.
- **Recalcular el costo promedio al reingresar la pieza:** el sistema no tiene costo promedio (usa el
  último costo, ADR-013); inventarlo cambiaría la valorización sin acuerdo del cliente.

## Consecuencias

- El futuro módulo de ventas llama a `ExchangesService.create` (o a `applyStockChanges` con las mismas
  dos líneas) y obtiene atomicidad y trazabilidad sin tocar el libro.
- El kardex y el historial muestran los cambios sin cambios de esquema adicionales.
- Pendiente de negocio: quién registra los cambios en el punto de venta (P-30) y si la pieza devuelta
  pasa por una revisión antes de ser vendible.

# ADR-026: Cambio de pieza de una venta (sin devoluciones)

- **Estado:** Aceptado (2026-11-14, por indicación del responsable)
- **Fecha:** 2026-11-14
- **Relacionados:** [ADR-007](ADR-007-inventory-ledger.md) (libro de movimientos),
  [ADR-019](ADR-019-cambios-de-pieza.md) (cambio de pieza a nivel de inventario),
  [ADR-022](ADR-022-venta-de-mostrador-inmutable.md) (venta inmutable, DEC-V07),
  [ADR-023](ADR-023-caja-unica-arqueo-y-correcciones.md) (caja y arqueo),
  [ADR-024](ADR-024-comprobante-interno.md) (comprobante)

## Contexto

El asesor legal de la tienda indicó (2026-11-14) que **no habrá devoluciones**: solo **cambio de
pieza**. Ejemplo: el cliente compró un anillo talla 10 y necesitaba la talla 12; se cambia. El
responsable fijó las reglas de operación:

1. Se cambia **con el comprobante de la venta** y **sin plazo** por ahora.
2. Se admite **diferencia de precio solo si la pieza nueva es más cara**; **nunca** se cambia por una
   pieza más económica (regla de negocio).
3. **El mismo vendedor** registra el cambio (la pieza ya está contabilizada).
4. La pantalla debe ser **muy simple** y la lógica **correcta**, sin duplicidad ni descuadres de
   ventas, caja o inventario.

Hasta ahora existía `POST /inventory/exchanges` (ADR-019): un doble movimiento de inventario para
Administrador y Responsable, **sin relación con una venta, sin precio y sin caja**. Servía como base,
pero por sí solo permite mover stock sin dinero de por medio y no aplica la regla de precio.

DEC-V07 sigue vigente: **una venta confirmada no se anula, no se edita y no se revierte**. Un cambio de
pieza no es una anulación: la venta queda exactamente igual; el cambio es un documento aparte.

## Decisión

Se agrega el **cambio de pieza de una venta** (`sale_exchanges`), un documento **inmutable** ligado a
la venta original, con su propio correlativo (`CMB-000001`) y comprobante.

**Qué es un cambio.** UNA pieza devuelta por UNA pieza distinta, la misma cantidad. La pieza devuelta
sale de (a) una línea de la venta o (b) la pieza entregada en un cambio anterior de esa misma venta
(un cliente puede volver a cambiar). Nunca se pueden cambiar más unidades de las disponibles.

**Precio.** El _crédito_ es lo que el cliente pagó por cada unidad que devuelve (el precio de la venta,
o el precio al que se le entregó en el cambio anterior). La diferencia es
`cantidad × (precio vigente de la pieza nueva − crédito)` y **debe ser ≥ 0**. Se cobra al momento, en
Bs, con los mismos medios que una venta (efectivo con vuelto, QR, transferencia).

**Stock.** En la misma transacción se aplican dos movimientos con `applyStockChanges` (ADR-007):
`EXCHANGE_IN` (entra la devuelta) y `EXCHANGE_OUT` (sale la entregada). La pieza devuelta vuelve al
stock vendible sin revisión previa (decisión del responsable, 2026-11-14). Si la entregada no tiene
stock, todo se revierte.

**Caja.** El cambio pertenece a la **caja abierta en ese momento** (no a la de la venta original) y
exige una caja abierta. La diferencia cobrada **en efectivo entra al arqueo**: el efectivo esperado es
`fondo + cobros en efectivo de ventas + cobros en efectivo de cambios`.

**Permiso.** `sales:exchange` (Vendedor, Responsable y Administrador). Cualquier persona con ese
permiso puede **buscar la venta por su número** (el cliente puede volver en otro turno); la búsqueda
solo devuelve las piezas y los precios que ya figuran en el comprobante, nunca pagos ni costos. Los
cambios ya registrados los ve quien los hizo, el vendedor de la venta y quien tiene `sales:read-all`.

**Idempotencia.** `Idempotency-Key` obligatoria; un reintento devuelve el mismo cambio y no mueve el
stock dos veces (igual que la venta).

**Concurrencia.** Orden global de bloqueos: caja abierta (FOR SHARE) → variantes y saldos de ambas
piezas (FOR UPDATE, en orden de id). Dos cambios simultáneos de la misma pieza se serializan.

### Garantías en la base de datos (migración `20261114000000_sale_exchanges_and_logo`)

No se confía solo en el servicio:

- CHECK: exactamente un origen; cantidad > 0; piezas distintas; **precio entregado ≥ crédito**;
  `difference = cantidad × (entregado − crédito)`.
- Inmutabilidad: `UPDATE` y `DELETE` de cambios y de sus pagos fallan (trigger).
- Un cambio solo nace en una **caja abierta** (`FOR SHARE`).
- Al `COMMIT` (trigger diferido): **Σ pagos = diferencia**; la pieza devuelta pertenece a la **misma
  venta**, es esa variante y se pagó a ese precio; **no se cambian más unidades que las disponibles**;
  cada lado apunta a **su movimiento** del libro (variante, cantidad con signo, tipo y documento).
- `cash_sessions_guard` se reemplaza (`CREATE OR REPLACE`): el cierre exige que el efectivo congelado
  sea `Σ efectivo de ventas + Σ efectivo de cambios` de la sesión.

## Alternativas descartadas

- **Devolución con reembolso:** contradice la política de la tienda y DEC-V07.
- **Anular la venta y rehacerla:** es un mecanismo de reversión encubierto (prohibido por DEC-V07).
- **Reutilizar `POST /inventory/exchanges` sin venta:** no valida el precio ni cobra; permite
  descuadrar la caja. Sigue existiendo solo como herramienta de inventario del Administrador y del
  Responsable (sin dinero de por medio).
- **Crédito = precio vigente de la pieza devuelta:** el cliente pagó otro precio si este cambió; se
  eligió lo que realmente pagó (el comprobante de la venta es el respaldo).
- **Varias piezas en un mismo cambio:** más complejo para la pantalla del vendedor; se registran como
  cambios separados.

## Consecuencias

- La venta original **no cambia**: ni su total, ni sus líneas, ni sus pagos. Los reportes de ventas no
  se alteran; los cambios se informan aparte (y en el detalle de la caja: cantidad y diferencia cobrada).
- Un cambio **no se deshace**. Si se cometió un error, lo corrige un nuevo cambio o un ajuste de
  inventario autorizado; la caja se corrige por el mecanismo de correcciones de cierre (Administrador).
- Borde conocido: si el precio de una pieza **subió** después de la venta, cambiar por una variante de
  la misma pieza cobra esa diferencia. La pantalla la muestra antes de confirmar. Si el responsable
  prefiere ignorar el alza para variantes de la misma pieza, se decide aparte (ver PENDIENTES, D-20).
- No hay plazo (decisión actual del responsable): queda a una constante si se quiere fijar uno.
- El comprobante del cambio no registra copias («COPIA»): reimprimir no deja traza (la venta sí).

## Pruebas

Integración (`apps/api/test/integration/sale-exchanges.test.ts`): permisos, validación, regla de
precio, stock por el libro, cobro y arqueo (incluido el cierre), idempotencia, concurrencia, cadena de
cambios, visibilidad, ausencia de costos y garantías de la base. Unitarias: `exchange-math.test.ts`.
Web: `exchange-page.test.tsx`, `exchange-math.test.ts`.

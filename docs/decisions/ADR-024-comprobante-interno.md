# ADR-024: Comprobante interno e impresión por navegador

- **Estado:** Aceptado (autorización del responsable del 2026-11-10, ver
  [RESOLUCIONES-2026-11-10](../business/RESOLUCIONES-2026-11-10.md))
- **Fecha:** 2026-11-11
- **Equivalencia:** es el «ADR-029» citado en los documentos de análisis de
  [`docs/propuestas/fase-2-ventas`](../propuestas/fase-2-ventas/11-plan-de-implementacion.md) (§10).

## Contexto

DEC-V12 (resolución 2026-11-07 §4) y C1 a C4 (2026-11-09): cada venta tiene un comprobante interno
imprimible desde el navegador, con la leyenda «No válido como factura fiscal» (la factura se emite en
un sistema externo, Q-V02). Imprimir no crea venta y reimprimir no cambia importes; la reimpresión se
marca «Copia» y se audita. Los datos comerciales (nombre, dirección, teléfono, NIT opcional) viven en
la base y los edita el Administrador.

## Decisión

1. **Proyección de filas inmutables:** `GET /sales/:id/receipt` arma el comprobante desde `sales`,
   `sale_items` y `sale_payments` (snapshots de precio, nombres y medio). Cambiar después el precio,
   el producto o el nombre del medio no cambia el comprobante. Sin costos y sin referencia de pago.
2. **Registro de impresiones append-only** (`sale_receipt_prints`): `POST /sales/:id/receipt/print-events`
   bloquea solo la fila de la venta (`FOR UPDATE`, sin modificarla), numera la copia (`MAX + 1`),
   inserta y audita `sale.receipt_printed`. La primera es el original; desde la segunda, «COPIA»
   (D-19). Registra la **solicitud**: el servidor no sabe si salió papel.
3. **Datos del negocio como registro único** `business_settings` (`id = 1`, `CHECK (id = 1)`):
   excepción justificada a «IDs UUID v7» porque no es una entidad sino una configuración única. Solo
   `settings:manage` (Administrador, no asignable a otros roles) la lee y edita; al resto llega solo
   dentro del comprobante. El comprobante usa los datos **vigentes** (D-08). `receipt_show_seller`
   decide si se imprime el vendedor (D-04, por defecto no).
4. **Formatos** 58 mm, 80 mm, A5 y A4 (A4 por defecto, recordado por navegador); el formato es solo de
   presentación (la API registra cuál se pidió). Sin logo hasta que se entregue (SD-R08 a).
5. Ver el comprobante y reimprimirlo exige poder ver la venta (D-06): propias con `sales:read`, todas
   con `sales:read-all`; una venta ajena responde 404.

## Alternativas consideradas

- **PDF generado en el servidor:** agrega dependencias y no aporta para impresoras térmicas del
  navegador (documento 04 §15).
- **Snapshot del encabezado del negocio por venta:** más fiel a la fecha de venta, pero exige una
  columna por dato; se deja para una migración futura si el contador lo pide (SD-R07).
- **Contador de impresiones en `sales`:** imposible sin romper la inmutabilidad de la venta.

## Consecuencias

- Un justificante falso por reimpresión queda mitigado por la marca «COPIA» y la auditoría (RK-23).
- Los requisitos del contador (SD-R07) y el logo siguen abiertos.

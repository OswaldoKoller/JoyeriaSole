# Ventas y caja: guía para la tienda

Guía breve para el personal. Explica cómo abrir la caja, vender, imprimir el comprobante y cerrar la
caja al final del día.

> **Importante:** una venta confirmada **no se puede anular, borrar ni modificar**. Antes de
> confirmar, el sistema muestra siempre una pantalla de revisión: revise allí las piezas, las
> cantidades, los precios y los pagos.

## Quién hace qué

| Tarea                                       | Administrador | Responsable de inventario | Vendedor  |
| ------------------------------------------- | :-----------: | :-----------------------: | :-------: |
| Vender (punto de venta)                     |      sí       |            sí             |    sí     |
| Cambiar una pieza de una venta              |      sí       |            sí             |    sí     |
| Ver las ventas                              |     todas     |           todas           | las suyas |
| Abrir y cerrar la caja                      |      sí       |            sí             |    no     |
| Corregir un cierre de caja ya hecho         |      sí       |            no             |    no     |
| Reportar una incidencia de una venta        |      sí       |            sí             |    sí     |
| Ver y cerrar incidencias                    |      sí       |            no             |    no     |
| Cambiar los datos del negocio (comprobante) |      sí       |            no             |    no     |

Estos permisos son los valores iniciales; el Administrador puede cambiarlos en «Roles».

## 1. Abrir la caja (al empezar el día)

1. En el menú, **Ventas → Caja**.
2. Pulse **Abrir caja**.
3. Cuente el dinero con el que empieza (el «fondo inicial») y escríbalo en **Fondo inicial (Bs)**.
   Puede usar coma o punto para los centavos. Si no hay fondo, escriba **0** (el campo vacío no
   vale como cero).
4. Pulse **Abrir caja**. Arriba aparece «Caja CAJ-… abierta».

Solo puede haber una caja abierta. Sin caja abierta **no se puede vender**.

## 2. Vender

1. En el menú, **Ventas → Punto de venta**.
2. **Agregar piezas:** con el lector de códigos, escanee la etiqueta (el lector escribe el código y
   pulsa Enter solo). También puede escribir el SKU o parte del nombre y pulsar Enter; si hay varias
   coincidencias, elija la pieza en la lista. Cada pieza aparece con su **foto junto al nombre**.
   - Escanear dos veces la misma pieza suma una unidad.
   - Puede cambiar la cantidad con **−** / **+** o escribiéndola, y quitar una línea con **Quitar**.
   - Si una pieza no tiene stock, está inactiva o no tiene precio, el sistema avisa y no la agrega.
3. **Cobrar** (panel «Cobro», en bolivianos):
   - **Efectivo recibido:** lo que le entrega el cliente. El sistema calcula el **vuelto**.
   - **QR** y **Transferencia:** el importe pagado por ese medio (la referencia es opcional y no se
     imprime).
   - Se pueden combinar medios (por ejemplo, parte por QR y el resto en efectivo). El vuelto solo
     sale del efectivo: QR y transferencia no pueden pasar del total.
   - Mientras falte dinero se muestra **Falta** y no se puede seguir.
4. Pulse **Revisar venta**. Revise con calma la pantalla de revisión: piezas, cantidades, precios,
   total, pagos, efectivo recibido y vuelto.
   - Si algo está mal, pulse **Volver a corregir**.
   - Si todo está bien, pulse **Confirmar venta**.
5. Aparece **«Venta VTA-… registrada»** con el total y el vuelto a entregar.

### Si algo sale mal al confirmar

- **«Cambió el precio…»** o **«No hay stock suficiente…»**: la venta **no** se registró. El carrito
  marca la pieza afectada; corrija y vuelva a revisar.
- **«La caja se cerró mientras cobraba»**: la venta **no** se registró. Pida que abran la caja y
  vuelva a pulsar **Confirmar venta**.
- **«Resultado incierto: no cobre de nuevo»**: se cortó la conexión y no se sabe si la venta quedó
  registrada. **No vuelva a cobrar al cliente.** Pulse **Reintentar**: si la venta ya existía, el
  sistema la reconoce y no la duplica. También puede revisar **Ver ventas del día**. Esto funciona
  aunque recargue la página.

## 3. Imprimir el comprobante

1. Tras la venta, pulse **Ver comprobante** (o abra la venta desde **Historial de ventas**).
2. Elija el formato: **Rollo de 58 mm**, **Rollo de 80 mm**, **Hoja A5** u **Hoja A4**. El navegador
   recuerda la última elección (A4 si nunca eligió otra).
3. Pulse **Imprimir comprobante de la venta VTA-…**. En el diálogo de impresión use **escala 100 %**
   y desactive **encabezados y pies de página**.

El comprobante dice siempre **«Comprobante interno»** y **«No válido como factura fiscal»**. Desde la
segunda impresión lleva la marca **«COPIA»**. Imprimir o reimprimir no cambia la venta.

## 4. Si hubo un error en una venta

Una venta confirmada no se corrige en el sistema. Abra la venta (**Historial de ventas** → número de
la venta) y pulse **Reportar incidencia**: elija el tipo y describa lo ocurrido. La incidencia **no
modifica la venta, el stock ni la caja**: avisa al Administrador, que la resuelve fuera del sistema y
la cierra describiendo lo que hizo (**Ventas → Incidencias**).

### Cambiar una pieza (no hay devoluciones)

La tienda no devuelve dinero: **cambia una pieza por otra de igual o mayor precio**, con el
comprobante. **Ventas → Cambio de pieza** → número de la venta → pieza que devuelve → pieza nueva →
cobrar la diferencia (si la hay) → **Registrar cambio**. El stock se corrige solo (entra la devuelta,
sale la nueva), la diferencia entra a la caja abierta y la venta original no se modifica. Paso a paso en
el [tutorial del Vendedor](../tutorial/vendedor.md#5-cambiar-una-pieza-no-hay-devoluciones).

## 5. Cerrar la caja (al terminar el día)

1. **Ventas → Caja → Cerrar caja**.
2. Cuente **todo** el efectivo de la caja (incluido el fondo inicial) y escríbalo en **Efectivo
   contado (Bs)**. Pulse **Continuar**.
3. El sistema muestra el **efectivo esperado** (fondo + cobros en efectivo), el contado y la
   **diferencia** («Sin diferencia», «Sobrante de …» o «Faltante de …»). Los cobros por QR y
   transferencia se informan aparte: no son efectivo.
4. Si hay diferencia, escriba una **observación** (obligatoria) explicando el motivo.
5. Pulse **Cerrar caja** y luego **Confirmar cierre**. **Un cierre no se puede reabrir.**

Si al cerrar llegó una venta de último momento, el sistema actualiza el esperado y le pide revisar.

### Corregir un cierre (solo Administrador)

Si al cerrar se escribió mal el contado o el fondo, el Administrador abre la caja en **Caja →
Historial de cajas**, pulsa **Corregir cierre**, indica el valor correcto y el motivo. El cierre
original no se borra: la caja queda marcada **«Corregida (N)»** y muestra las cifras originales y las
vigentes. Una corrección nunca cambia ventas, pagos ni stock.

## 6. Datos del comprobante (solo Administrador)

En **Ventas → Datos del negocio** se cargan el nombre comercial, la dirección, el teléfono, el NIT
(opcional), el **logo**, la **leyenda del pie** (política de cambios) y si el comprobante debe mostrar
el nombre de quien atendió. Los comprobantes, también
las reimpresiones, muestran siempre los datos vigentes; los importes de las ventas no cambian.

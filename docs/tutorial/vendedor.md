# Guía del Vendedor

[← Índice del tutorial](README.md)

El Vendedor **vende** en el mostrador, **consulta** el catálogo y el stock, ve **sus propias
ventas** y **reporta incidencias**. No ve costos de compra.

**No puede:** abrir ni cerrar la caja, editar el catálogo, cambiar precios, registrar ingresos,
ajustes o conteos, ni ver las ventas de otros. Que el Vendedor venda y vea solo sus ventas es un
**valor por defecto, pendiente de confirmación** (D-01, D-02).

## 1. Inicio y menú

Su menú es más corto: Inicio, Productos, Categorías, Atributos, Etiquetas (solo ver), Saldos y
alertas, Movimientos, Mi cuenta, Punto de venta e Historial de ventas.

![Inicio del Vendedor](img/vendedor/01-inicio.png)

Si escribe la dirección de una pantalla que no le corresponde:

![Sin permiso](img/vendedor/14-sin-permiso.png)

## 2. Consultar productos y stock

**Catálogo → Productos**: busque por nombre, SKU o código de barras y toque un producto para ver su
ficha (fotos, variantes, precio, stock). Solo lectura.

![Productos](img/vendedor/03-productos.png)

![Ficha del producto](img/vendedor/04-ficha-producto.png)

**Inventario → Saldos y alertas** muestra cuántas piezas hay; **Movimientos**, el historial.

![Saldos](img/vendedor/05-saldos.png)

![Movimientos](img/vendedor/06-movimientos.png)

## 3. Vender

```mermaid
flowchart TD
  A{¿Hay caja abierta?} -- No --> B[Pida al Responsable o Administrador que abra la caja]
  A -- Sí --> C[Escanear o buscar piezas]
  C --> D[Cobrar: efectivo, QR, transferencia]
  D --> E[Revisar venta]
  E -- Algo está mal --> C
  E -- Todo bien --> F[Confirmar venta]
  F --> G[Ver e imprimir comprobante]
```

### Si no hay caja abierta

El punto de venta muestra **«No hay caja abierta. No se puede vender.»** El Vendedor no puede abrir
la caja: avise al Responsable o al Administrador.

![Sin caja abierta](img/vendedor/02-pos-sin-caja.png)

### Paso a paso

1. **Ventas → Punto de venta**.
2. Escanee la etiqueta con el lector (escribe el código y pulsa Enter solo) o escriba SKU o nombre y
   pulse Enter. Escanear dos veces suma una unidad.
3. En **Cobro**, escriba el **efectivo recibido** (y/o QR, transferencia). El sistema calcula el
   vuelto. Mientras falte dinero se ve **Falta**.
4. **Revisar venta**: compruebe piezas, cantidades, precios y pagos.
5. **Confirmar venta**. Aparece «Venta VTA-… registrada» con el vuelto a entregar.

![Venta en efectivo](img/vendedor/07-pos-venta-efectivo.png)

![Revisión](img/vendedor/08-pos-revision.png)

![Venta registrada](img/vendedor/09-venta-registrada.png)

Para imprimir el comprobante y los errores posibles al confirmar, vea la
[guía de ventas y caja](../guias/ventas-y-caja.md). Tres medios de pago fijos y referencia opcional
que no se imprime: **valor por defecto, pendiente de confirmación** (D-09). Sin descuentos ni datos
del cliente (D-16).

## 4. Mis ventas

**Ventas → Historial de ventas** muestra solo sus ventas. Abra una para ver el detalle y el
comprobante.

![Mis ventas](img/vendedor/10-mis-ventas.png)

![Detalle de la venta](img/vendedor/11-venta-detalle.png)

## 5. Cambiar una pieza (no hay devoluciones)

La tienda **no hace devoluciones**: solo **cambia una pieza por otra de igual o mayor precio**, con el
comprobante de la venta y sin plazo. Si la pieza nueva cuesta más, el cliente **paga la diferencia**.
**Nunca** se cambia por una pieza más barata.

1. Pida el **comprobante** al cliente y anote el número de la venta (**VTA-000123**).
2. Menú **Ventas → Cambio de pieza** (o, en el detalle de la venta, **Cambiar una pieza**).
3. Escriba el número de la venta y pulse **Buscar venta**. Aparecen las piezas de esa venta con la foto
   y **lo que el cliente pagó**.
4. Elija la **pieza que el cliente devuelve** (y cuántas unidades, si compró varias).
5. Escanee o escriba el código de la **pieza nueva**. El sistema avisa si:
   - cuesta menos que la devuelta (no se puede),
   - es la misma pieza, está inactiva, no tiene precio o no tiene stock.
6. Si la pieza nueva cuesta más, aparece **Diferencia a cobrar**: cobre en efectivo (con el vuelto),
   QR o transferencia, igual que en una venta. Si cuesta lo mismo, no hay nada que cobrar.
7. Pulse **Registrar cambio**. Aparece el cambio **CMB-000001**: imprima su **comprobante**.

![Venta encontrada por su número](img/vendedor/17-cambio-venta-encontrada.png)

![Una pieza más barata no se admite](img/vendedor/18-cambio-pieza-mas-barata.png)

![Diferencia a cobrar y vuelto](img/vendedor/19-cambio-cobro-diferencia.png)

![Cambio registrado](img/vendedor/20-cambio-registrado.png)

![Comprobante del cambio](img/vendedor/21-cambio-comprobante.png)

Qué hace el sistema por usted: la pieza que devuelve el cliente **vuelve al stock** y la nueva **sale del
stock**; la diferencia entra a la **caja** (si es efectivo, cuenta en el arqueo). La venta original
**no se modifica**. Un cambio **no se puede deshacer**: si se equivocó, avise al Administrador.

Requisito: **debe haber una caja abierta**. Los cambios se ven en **Ventas → Historial de cambios** y
en el detalle de la venta.

![Historial de cambios](img/vendedor/22-historial-de-cambios.png)

## 6. Reportar una incidencia

Si una venta tuvo un error (pieza equivocada, pago mal registrado, duplicada…):

1. Abra la venta y pulse **Reportar incidencia**.
2. Elija el **tipo** y describa **qué pasó**.
3. Pulse **Reportar incidencia**. Aparece «Incidencia INC-… registrada».

La incidencia **no modifica la venta, el stock ni la caja**: avisa al Administrador, que la resuelve.

![Reportar incidencia](img/vendedor/12-incidencia-reportar.png)

![Incidencia registrada](img/vendedor/13-incidencia-registrada.png)

## 7. En el celular

El sistema se adapta a la pantalla del celular. El menú se abre con **Abrir menú**.

![Punto de venta en el celular](img/vendedor/15-movil-pos.png)

![Menú en el celular](img/vendedor/16-movil-menu.png)

## Errores frecuentes y qué hacer

| Mensaje                                                  | Qué hacer                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| «No hay caja abierta. No se puede vender.»               | Pida que abran la caja.                                                      |
| La pieza no se agrega (sin stock, inactiva o sin precio) | Avise al Responsable; no venda esa pieza hasta que se corrija.               |
| «Cambió el precio…» / «No hay stock suficiente…»         | La venta no se registró. Corrija el carrito y vuelva a revisar.              |
| «Resultado incierto: no cobre de nuevo»                  | **No cobre otra vez.** Pulse **Reintentar**; el sistema no duplica la venta. |
| «No tiene permiso para ver esta sección.»                | Esa pantalla no es de su rol.                                                |

## Buenas prácticas

- Revise **siempre** la pantalla de revisión: **una venta confirmada no se anula** (DEC-V07).
- Si hubo un error, **reporte una incidencia**; no intente «compensar» con otra venta.
- Entregue el vuelto que indica el sistema y cuente el dinero delante del cliente.
- Pulse **Salir** al terminar su turno.

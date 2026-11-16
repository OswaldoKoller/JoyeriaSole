# Guía del Responsable de inventario

[← Índice del tutorial](README.md)

El Responsable de inventario gestiona el **catálogo**, los **proveedores**, los **ingresos**, el
**stock** (stock inicial, ajustes, conteos) y los **precios**; además **vende** y **abre y cierra la
caja**. Puede aprobar ajustes, precios y conteos para que nada quede bloqueado esperando al
Administrador.

**No puede:** gestionar usuarios ni roles, ver la auditoría, corregir cierres de caja, ver o cerrar
incidencias, cambiar los datos del negocio ni los tipos de costo, ni eliminar fichas.

![Inicio del Responsable](img/responsable/01-inicio.png)

Si entra a una pantalla que no le corresponde, el sistema lo indica:

![Sin permiso](img/responsable/33-sin-permiso-usuarios.png)

El catálogo (productos, fotos, etiquetas, proveedores) funciona igual que para el Administrador:
vea la [guía del Administrador, secciones 2 y 3](administrador.md#2-catálogo).

## 1. Stock inicial

Para la **primera carga** de una pieza que todavía no tiene ningún movimiento.

1. **Inventario → Stock inicial** (muestra solo las piezas sin movimientos).
2. Busque la pieza y pulse **Stock inicial de SKU-…**.
3. Escriba la **cantidad en piezas** y el **motivo**, y registre.
4. Aparece el aviso verde **«Stock inicial registrado: N piezas de …»**. La pieza sale de esta lista
   porque ya tiene movimientos: su saldo se ve en **Saldos y alertas** y el movimiento en
   **Movimientos**. Si la lista queda vacía, el sistema lo explica y enlaza a Saldos y alertas.

![Stock inicial](img/responsable/02-stock-inicial.png)

![Formulario de stock inicial](img/responsable/03-stock-inicial-formulario.png)

![Aviso de stock inicial registrado](img/responsable/04-stock-inicial-registrado.png)

Para todo lo demás use un **ingreso** o un **ajuste**.

## 2. Ingreso de mercadería

```mermaid
flowchart LR
  A[Crear borrador: proveedor y documento] --> B[Agregar ítems: cantidad y precio de compra]
  B --> C[Guardar ítems]
  C --> D[Agregar costos adicionales y guardar]
  D --> E{¿Todo correcto?}
  E -- No --> B
  E -- Sí --> F[Confirmar ingreso]
  F --> G[El stock sube y se guarda el costo total]
```

1. **Compras → Ingresos de mercadería → Nuevo ingreso**.
2. Elija el **proveedor** (la moneda se propone sola), tipo y número de documento, y pulse **Crear
   borrador**. Un borrador **no cambia el stock**.
3. En **Ítems recibidos**, busque cada pieza por SKU, código o nombre y pulse **Agregar**. Escriba la
   **cantidad recibida** y el **precio de compra**. Si llegó distinta cantidad de la esperada,
   escriba la justificación. Pulse **Guardar ítems**.
4. Si llegó una pieza que no está en el catálogo: **Alta rápida de pieza nueva**.
5. En **Costos adicionales**, pulse **Agregar costo**, elija el tipo (transporte, aduana…) y el monto
   en bolivianos, y pulse **Guardar costos**. Se reparten entre los ítems según su valor de compra.
6. Revise el **Panel de costos** (costo total unitario de cada pieza).
7. Pulse **Confirmar ingreso**. Recién ahora sube el stock.

![Nuevo ingreso](img/responsable/05-ingreso-nuevo.png)

![Ítems y costos](img/responsable/06-ingreso-items-y-costos.png)

![Listo para confirmar](img/responsable/07-ingreso-listo-para-confirmar.png)

![Ingreso confirmado](img/responsable/08-ingreso-confirmado.png)

**Avisos frecuentes**

- «Guarde los ítems antes de confirmar» / «Guarde los costos adicionales antes de confirmar»: pulse
  el botón **Guardar** de esa sección.
- «Justifique la diferencia de SKU-…»: la cantidad recibida no coincide con la esperada.
- Con costos adicionales y valor de compra cero no se puede confirmar: escriba los precios.
- Un ingreso confirmado ya no se edita. Si se equivocó, corrija con un **ajuste**.
- Cómo prorratear y el método de costeo están **pendientes de confirmación** (P-07): hoy se reparte
  en proporción al valor de compra.

## 3. Precios

Como Responsable puede **aplicar precios directamente** (también aprobar o rechazar solicitudes, ver
la [guía del Administrador](administrador.md#5-precios-aprobar-solicitudes)).

1. **Catálogo → Precios** y busque la pieza.
2. Escriba el **nuevo precio**: el sistema muestra la **ganancia** contra el costo total mientras
   escribe.
3. Escriba un motivo (opcional) y pulse **Aplicar ahora (N)**. Debajo, el sistema le recuerda que
   usted autoriza precios: el cambio rige de inmediato y queda en el historial a su nombre.

![Nuevo precio](img/responsable/09-precios-nuevo-precio.png)

![Precio aplicado](img/responsable/10-precios-aplicado.png)

Un rol que solo pueda **solicitar** precios verá **Solicitar cambio (N)** en lugar de «Aplicar ahora»; la
solicitud queda en **Pendientes** hasta que alguien la apruebe.

## 4. Ajustes

```mermaid
flowchart LR
  A[Solicitar ajuste: pieza, diferencia, motivo] --> B[Pendiente de aprobación]
  B -- Aprobar --> C[Cambia el stock y queda en Movimientos]
  B -- Rechazar con motivo --> D[El stock no cambia]
  B -- Cancelar solicitud --> D
```

1. **Inventario → Ajustes → Solicitar ajuste** (o **Ajustar a cero** desde Saldos).
2. Agregue la pieza, escriba la **diferencia** (por ejemplo `-1`); el sistema muestra cuánto
   **quedaría**.
3. Elija el **motivo** (Rotura, Pérdida, Muestra, Otro…). Con «Otro» la observación es obligatoria.
4. Pulse **Enviar solicitud**. El stock **no cambia** todavía.
5. Otra persona autorizada (Administrador u otro Responsable) **aprueba** o **rechaza**.

![Error: falta observación](img/responsable/11-ajuste-error-observacion.png)

![Solicitud de ajuste](img/responsable/12-ajuste-solicitud.png)

![Ajuste pendiente](img/responsable/13-ajuste-pendiente.png)

![Rechazar ajuste](img/responsable/14-ajuste-rechazar.png)

![Ajuste rechazado](img/responsable/15-ajuste-rechazado.png)

Las reglas finas de los ajustes manuales siguen **pendientes de confirmación** (P-01).

## 5. Conteo físico a ciegas

```mermaid
flowchart LR
  A[Crear conteo de una categoría] --> B[Iniciar conteo]
  B --> C[Escanear piezas a ciegas]
  C --> D[Cerrar conteo]
  D --> E{¿Hay diferencias?}
  E -- Sí --> F[Segundo recuento de esas piezas]
  F --> G[Cerrar recuento]
  E -- No --> H[Revisión]
  G --> H
  H --> I[Aprobar conteo: se ajusta el stock]
```

1. **Inventario → Conteo físico**, elija la **categoría a contar** y pulse **Crear conteo**.
2. Pulse **Iniciar conteo**. El campo **Código de la pieza** queda listo para el lector.
3. Escanee cada pieza (cada lectura suma 1). También puede escribir la cantidad. **No verá** lo que
   dice el sistema: el conteo es **a ciegas**.
   - Códigos desconocidos o de otra categoría se anotan como **hallazgos** (no cambian el stock).
   - **Deshacer última lectura** si se equivocó.
4. Pulse **Cerrar conteo**. Las piezas con diferencia pasan a **Segundo recuento**: cuéntelas otra
   vez, escriba la cantidad y pulse **Cerrar recuento**.
5. En la **Revisión** se ven esperado, conteo, recuento y diferencia. Regularice los hallazgos y
   pulse **Aprobar conteo**: recién ahí se ajusta el stock.

![Crear conteo](img/responsable/16-conteo-crear.png)

![Conteo en borrador](img/responsable/17-conteo-borrador.png)

![Captura a ciegas](img/responsable/18-conteo-captura-a-ciegas.png)

![Segundo recuento](img/responsable/19-conteo-segundo-recuento.png)

![Revisión del conteo](img/responsable/20-conteo-revision.png)

> En la captura de demostración solo se escanearon algunas piezas, por eso aparecen muchas
> diferencias. En la tienda, cuente **todas** las piezas de la categoría.

El alcance del inventario físico está **pendiente de confirmación** (P-13).

## 6. Vender

El punto de venta es igual para todos los roles. Paso a paso:

1. **Ventas → Punto de venta**. El campo **Código de la pieza** queda activo.
2. Escanee la etiqueta (o escriba SKU o nombre y Enter).
3. En **Cobro**, escriba lo pagado por **QR** o **Transferencia** y el **Efectivo recibido**; el
   sistema calcula el **vuelto**.
4. **Revisar venta** → revise todo → **Confirmar venta**.

![Punto de venta](img/responsable/22-pos-vacio.png)

![Pieza agregada](img/responsable/23-pos-pieza-agregada.png)

![Pago mixto](img/responsable/24-pos-pago-mixto.png)

![Revisión](img/responsable/25-pos-revision.png)

![Venta registrada](img/responsable/26-venta-registrada.png)

### Comprobante

**Ver comprobante**, elija el formato (58 mm, 80 mm, A5, A4) e imprima. Así queda impreso:

![Comprobante](img/responsable/27-comprobante.png)

![Comprobante impreso](img/responsable/28-comprobante-impresion.png)

Más detalle y errores al confirmar: [guía de ventas y caja](../guias/ventas-y-caja.md).

## 7. Caja: abrir y cerrar

```mermaid
flowchart LR
  A[Abrir caja con fondo inicial] --> B[Ventas del día]
  B --> C[Cerrar caja: contar el efectivo]
  C --> D{¿Diferencia?}
  D -- No --> E[Confirmar cierre]
  D -- Sí --> F[Escribir observación obligatoria]
  F --> E
  E --> G[Caja cerrada: no se reabre]
  G -. error de captura .-> H[El Administrador corrige]
```

**Abrir:** **Ventas → Caja → Abrir caja**, escriba el **Fondo inicial (Bs)** (0 si no hay; vacío no
vale, **valor por defecto, pendiente de confirmación**, D-05) y confirme.

![Caja abierta](img/responsable/21-caja-abierta.png)

**Cerrar:**

1. **Ventas → Caja**: verá el efectivo esperado en vivo (arqueo no ciego, **valor por defecto,
   pendiente de confirmación**, D-12).
2. **Cerrar caja**, escriba el **Efectivo contado (Bs)** (todo, incluido el fondo) y **Continuar**.
3. Si hay **Sobrante** o **Faltante**, escriba la **observación** (obligatoria).
4. **Cerrar caja** → **Confirmar cierre**. **Un cierre no se puede reabrir.**

![Caja con ventas](img/responsable/29-caja-con-ventas.png)

![Arqueo con diferencia](img/responsable/30-caja-arqueo-diferencia.png)

![Confirmar cierre](img/responsable/31-caja-confirmar-cierre.png)

![Caja cerrada](img/responsable/32-caja-cerrada.png)

Si se equivocó al escribir el contado, pida al **Administrador** que corrija el cierre.

## 8. Cambios de pieza

La tienda **no hace devoluciones**: solo cambia una pieza por otra de **igual o mayor precio**, con el
comprobante de la venta (ver el paso a paso en [el tutorial del Vendedor](vendedor.md#5-cambiar-una-pieza-no-hay-devoluciones);
es el mismo para el Responsable). La diferencia se cobra en la caja abierta y entra al arqueo. En
**Movimientos** se ven como «Cambio: entrada de pieza devuelta» y «Cambio: salida de pieza entregada».

Además, el Responsable puede usar el cambio **de inventario** (sin venta ni dinero) por la API, para
casos internos; el cambio normal del mostrador es el de **Ventas → Cambio de pieza**.

## Buenas prácticas

- Nunca «arregle» el stock con un ingreso falso: use un **ajuste** con motivo.
- Confirme el ingreso **el mismo día** que llega la mercadería.
- En el conteo, no mire los saldos del sistema: la gracia es contar a ciegas.
- Una venta confirmada **no se anula** (DEC-V07); si hubo error, reporte una **incidencia** (no
  cambia el stock).
- Cierre la caja al final del día; no se cierra sola (D-18).

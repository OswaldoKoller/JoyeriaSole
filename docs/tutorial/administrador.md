# Guía del Administrador

[← Índice del tutorial](README.md)

El Administrador tiene **acceso total**. Además de todo lo que hace el Responsable de inventario,
es el único que puede: gestionar **usuarios y roles**, ver la **auditoría**, **corregir cierres de
caja**, **ver y cerrar incidencias**, cambiar los **datos del negocio** y los **tipos de costo**, y
**eliminar** una ficha de producto que nunca tuvo movimientos.

## 1. Inicio y bandeja de aprobaciones

Al entrar verá el resumen del inventario y, arriba, la bandeja **Pendientes de aprobación** (ajustes
y cambios de precio que esperan su decisión), y avisos de fichas incompletas o productos sin precio.

![Inicio del Administrador](img/administrador/01-inicio.png)

Más abajo, la tabla **Piezas que requieren atención** (sin stock o bajo mínimo).

![Inicio completo](img/administrador/02-inicio-completo.png)

## 2. Catálogo

### Categorías y atributos

**Catálogo → Categorías** organiza los productos en árbol (por ejemplo Anillos, Aretes).
**Catálogo → Atributos** define los ejes de variante (talla, material…) y las características
informativas (tono, dimensiones…), con sus valores.

![Categorías](img/administrador/03-categorias.png)

![Atributos](img/administrador/04-atributos.png)

### Crear un producto

El listado de productos muestra cada ficha con su foto, precio y estado:

![Productos](img/administrador/05-productos.png)

1. **Catálogo → Productos → Nuevo producto**.
2. Elija la **categoría** y escriba el **nombre** siguiendo el formato sugerido
   (`<Tipo de pieza> <rasgo principal> <modelo>`, sin repetir material ni talla).
3. Si el producto tiene versiones, marque **Variante por …** y elija el valor de la primera variante.
4. Opcional: modelo, código del proveedor, stock mínimo, descripción y características.
5. **Precio de venta inicial (neto)**: en bolivianos; después solo cambia desde **Precios**.
6. Pulse **Guardar producto**. El sistema asigna el **SKU** automáticamente.

![Formulario de producto](img/administrador/06-producto-formulario.png)

![Producto creado](img/administrador/07-producto-creado.png)

Una ficha sin descripción ni características aparece como **Ficha incompleta** hasta completarla.

### Ficha del producto y fotos

Toque un producto para ver su ficha: fotos (hasta 5; la primera es la portada), variantes, SKU,
códigos, precio, stock y stock mínimo. Quien gestiona el catálogo puede subir fotos, elegir la
portada, reordenarlas y eliminarlas (pide confirmación).

![Ficha del producto](img/administrador/08-ficha-producto.png)

![Ficha completa](img/administrador/09-ficha-producto-completa.png)

### Etiquetas con código

**Catálogo → Etiquetas**: escanee o escriba un SKU, código o nombre, pulse **Agregar**, ajuste las
copias y el tamaño (mm) e imprima. La vista previa muestra el código de barras.

![Etiquetas](img/administrador/10-etiquetas.png)

## 3. Proveedores y tipos de costo

**Compras → Proveedores → Nuevo proveedor**: nombre, NIT, tipo (nacional o del exterior), moneda
habitual, contacto, condiciones de pago. Un proveedor con historial no se borra: se **desactiva**.

![Proveedores](img/administrador/11-proveedores.png)

![Nuevo proveedor](img/administrador/12-proveedor-formulario.png)

**Compras → Tipos de costo** (solo Administrador): los conceptos de costo adicional de un ingreso
(transporte, aduana, comisiones…).

![Tipos de costo](img/administrador/13-tipos-de-costo.png)

## 4. Ingresos de mercadería

El flujo completo está en la [guía del Responsable](responsable-inventario.md#2-ingreso-de-mercadería).
Aquí, un ingreso de importación ya **confirmado** en dólares, con aduana y comisiones repartidas:

![Ingresos](img/administrador/14-ingresos.png)

![Ingreso confirmado](img/administrador/15-ingreso-confirmado-importacion.png)

## 5. Precios: aprobar solicitudes

```mermaid
flowchart LR
  A[Alguien solicita un precio nuevo] --> B{Administrador o Responsable}
  B -- Aprueba --> C[El precio cambia y queda en el historial]
  B -- Rechaza con comentario --> D[El precio no cambia]
  E[Quien puede aprobar] -- Aplicar ahora --> C
```

1. **Catálogo → Precios**. La pestaña **Precios** muestra costo total, precio y ganancia de cada pieza.
2. Pestaña **Pendientes (N)**: marque las solicitudes y pulse **Aprobar seleccionadas** o
   **Rechazar seleccionadas…** (con motivo).
3. Pestaña **Historial**: todos los cambios aprobados y rechazados, con quién y cuándo.

![Precios](img/administrador/16-precios.png)

![Solicitudes pendientes](img/administrador/17-precios-pendientes.png)

![Selección](img/administrador/18-precios-seleccion.png)

![Aprobado](img/administrador/19-precios-aprobado.png)

![Historial de precios](img/administrador/20-precios-historial.png)

> El sistema **no** calcula el precio de venta automáticamente («costo × 2» está pendiente de
> confirmación, P-03). El precio lo decide una persona.

## 6. Ajustes: aprobar o rechazar

**Inventario → Ajustes** lista las solicitudes. Abra una pendiente, revise la diferencia, la
cantidad anterior y la que quedaría, y pulse **Aprobar ajuste** (pide confirmación) o **Rechazar
ajuste** (con motivo). Recién al aprobar cambia el stock.

![Ajustes](img/administrador/21-ajustes.png)

![Ajuste pendiente](img/administrador/22-ajuste-pendiente.png)

![Ajuste aprobado](img/administrador/23-ajuste-aprobado.png)

La solicitud está en la [guía del Responsable](responsable-inventario.md#4-ajustes).

## 7. Inventario: conteos, saldos y movimientos

![Conteos físicos](img/administrador/24-conteos.png)

![Saldos y alertas](img/administrador/25-saldos.png)

![Movimientos](img/administrador/26-movimientos.png)

## 8. Caja

Abrir y cerrar se explica en la [guía del Responsable](responsable-inventario.md#7-caja-abrir-y-cerrar).

![Caja cerrada](img/administrador/27-caja-cerrada.png)

![Abrir caja](img/administrador/28-caja-abrir.png)

![Caja abierta](img/administrador/29-caja-abierta.png)

### Corregir un cierre (solo Administrador)

Si al cerrar se escribió mal el contado o el fondo:

1. **Ventas → Caja → Historial de cajas** y abra la caja.
2. Pulse **Corregir cierre**, elija **Qué se corrige**, el **valor correcto** y el **motivo**.
3. Pulse **Registrar corrección**. La caja queda **«Corregida (N)»** y muestra las cifras originales
   y las vigentes. Nunca cambia ventas, pagos ni stock.

![Cierre con faltante](img/administrador/30-caja-cierre-con-faltante.png)

![Corregir cierre](img/administrador/31-caja-corregir.png)

![Cierre corregido](img/administrador/32-caja-corregida.png)

![Historial de cajas](img/administrador/33-caja-historial.png)

Correcciones sin plazo y que un Administrador pueda corregir su propio cierre: **valor por defecto,
pendiente de confirmación** (D-14).

## 9. Ventas e incidencias

**Ventas → Historial de ventas** muestra **todas** las ventas. No hay botón de anular ni editar:
**una venta confirmada no se anula** (DEC-V07).

![Historial de ventas](img/administrador/34-ventas-historial.png)

![Detalle de venta](img/administrador/35-venta-detalle.png)

**Ventas → Incidencias** (solo Administrador): abra la incidencia, resuelva el caso **fuera del
sistema**, escriba la **resolución** y pulse **Cerrar incidencia**. No modifica la venta, el stock ni
la caja. Incidencias dentro del sistema y sus tipos: **valor por defecto, pendiente de
confirmación** (D-10, D-11).

![Incidencias](img/administrador/36-incidencias.png)

![Cerrar incidencia](img/administrador/37-incidencia-cerrar.png)

![Incidencia cerrada](img/administrador/38-incidencia-cerrada.png)

## 10. Datos del negocio

**Ventas → Datos del negocio**: nombre comercial, dirección, teléfono, **NIT**, si el comprobante
muestra a quien atendió y la **leyenda del pie** (por defecto: «No se aceptan devoluciones. Solo se
realizan cambios de pieza presentando este comprobante.»; déjela vacía para no imprimir nada). Los
comprobantes, también los reimpresos, muestran los datos **vigentes** (D-07 y D-08, confirmados).

**Logo**: debajo del formulario, **Subir logo** (PNG, JPG o WebP de hasta 2 MB; mejor con fondo blanco
o transparente). El sistema lo reduce y lo guarda; aparece en el encabezado del comprobante de venta y
del de cambio. **Cambiar logo** lo reemplaza y **Quitar logo** lo elimina. Se guarda al instante.

![Datos del negocio](img/administrador/39-datos-negocio.png)

![Logo del negocio cargado](img/administrador/48-logo-del-negocio.png)

_(El logo de las capturas es de demostración.)_

## 11. Usuarios

1. **Acceso → Usuarios → Nuevo usuario**: nombre, correo, contraseña inicial (mínimo 10 caracteres)
   y rol.
2. **Editar** permite cambiar datos y rol, **restablecer la contraseña** (temporal: la persona debe
   cambiarla al entrar) y **desactivar** el acceso. Los usuarios no se borran.

![Usuarios](img/administrador/40-usuarios.png)

![Nuevo usuario](img/administrador/41-usuario-nuevo.png)

![Editar y restablecer](img/administrador/42-usuario-editar-restablecer.png)

## 12. Roles

**Acceso → Roles**: ver los roles, cuántos usuarios los tienen y sus permisos; crear roles
personalizados marcando permisos. Corregir cierres, gestionar incidencias y la configuración no se
pueden dar a otro rol.

![Roles](img/administrador/43-roles.png)

![Nuevo rol](img/administrador/44-rol-nuevo.png)

## 13. Auditoría

**Acceso → Auditoría**: quién hizo qué y cuándo. Filtre por acción, entidad, usuario o fecha y pulse
**Ver detalle** para ver los valores antes y después.

![Auditoría](img/administrador/45-auditoria.png)

![Detalle de auditoría](img/administrador/46-auditoria-detalle.png)

## 14. Mi cuenta

![Mi cuenta](img/administrador/47-mi-cuenta.png)

## Buenas prácticas

- Un usuario **por persona**; no comparta contraseñas. Desactive a quien deja la tienda.
- Revise la bandeja de aprobaciones cada día.
- Antes de corregir un cierre, hable con quien lo hizo y escriba un motivo claro.
- Las incidencias no cambian nada: ciérrelas describiendo lo que se hizo fuera del sistema.
- El stock y las ventas no se editan a mano: todo pasa por ingresos, ajustes, conteos o ventas, y
  queda en el historial y en la auditoría.

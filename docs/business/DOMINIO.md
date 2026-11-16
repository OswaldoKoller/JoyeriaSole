# Dominio de negocio — Fase 1: Inventario y Control de Productos

Este documento describe **conceptos y flujos**. Las reglas no confirmadas se marcan
**PENDIENTE (P-xx)** y están detalladas en [PENDIENTES.md](PENDIENTES.md), que es la fuente única del estado
de cada decisión. Las respuestas más recientes del cliente están en
[RESOLUCIONES-2026-11-05.md](RESOLUCIONES-2026-11-05.md) (su sección 7 prevalece); las resoluciones del
[2026-10-09](RESOLUCIONES-2026-10-09.md) y del [2026-10-11](RESOLUCIONES-2026-10-11.md) son históricas y varias
de sus reglas fueron sustituidas (por ejemplo, la fórmula de precio `× 2`).

## Glosario

| Término                  | Significado                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Producto**             | Ficha comercial: nombre, descripción, modelo, categoría, atributos comunes. No tiene stock propio.                                                                                                                                                                                        |
| **Variante**             | Unidad controlable de inventario. Tiene SKU, código de barras, stock, stock mínimo, costo, precio y estado. Todo producto tiene ≥ 1 variante.                                                                                                                                             |
| **Eje de variante**      | Atributo que diferencia variantes de un mismo producto (material, talla, longitud...).                                                                                                                                                                                                    |
| **Atributo descriptivo** | Atributo común a todas las variantes del producto (colección, género, tipo de cierre...).                                                                                                                                                                                                 |
| **SKU**                  | Código interno único por variante, generado con correlativo automático. Formato técnico actual: `SKU-000001`.                                                                                                                                                                             |
| **Etiqueta propia**      | Code 128 con el SKU de la variante, en todas las piezas (P-06 cerrada).                                                                                                                                                                                                                   |
| **Movimiento**           | Registro inmutable de un cambio de stock (+ entrada / − salida).                                                                                                                                                                                                                          |
| **Saldo (balance)**      | Stock actual de una variante = suma de sus movimientos.                                                                                                                                                                                                                                   |
| **Proveedor**            | Ficha (C8): nombre (único dato obligatorio), tipo nacional/del exterior, país, NIT o identificador fiscal, contacto, teléfono, WhatsApp, correo, dirección, moneda habitual de compra (Bs/USD, solo sugerida al registrar un ingreso), condiciones de pago (texto libre), notas y estado. |
| **Ingreso**              | Recepción de mercadería de un proveedor con su documento de respaldo.                                                                                                                                                                                                                     |
| **Inventario físico**    | Conteo real comparado contra el sistema para detectar y corregir diferencias.                                                                                                                                                                                                             |

## Producto vs. Variante

```
PRODUCTO: Anillo Solitario Circona  (categoría: Anillos; colección: Clásica)
  ejes de variante: material, talla
  ├── VARIANTE  Plata 925 / Talla 16   SKU …  stock 4  mín 2  costo …  precio …
  ├── VARIANTE  Plata 925 / Talla 18   SKU …  stock 0  mín 2
  ├── VARIANTE  Oro 18K   / Talla 16   SKU …  stock 1  mín 1
  └── VARIANTE  Oro 18K   / Talla 18   SKU …  stock 2  mín 1
```

- El **stock se controla siempre sobre la variante**.
- Un producto sin diferencias (p. ej. un llavero único) tiene **una sola variante** sin ejes.
- Qué atributos son ejes lo decide **cada producto** (`product_variant_axes`). La categoría solo
  **sugiere** atributos (`category_attributes`).
- El cliente puede crear valores de atributos y asignar características a cada producto (P-15). No se registra gramaje ni se controla stock por peso; se usan variantes y características definidas (P-27).

Diferencias por tipo de producto, sin columnas vacías:

| Categoría       | Atributos típicos              |
| --------------- | ------------------------------ |
| Anillo          | talla, material, piedra, color |
| Cadena / collar | longitud, material, color      |
| Aretes          | dimensiones, material, piedra  |
| Polo            | talla, color, género           |

## Catálogo: atributos, códigos, etiquetas y ficha incompleta (S2)

**Atributos (B2).** Las 12 definiciones base tienen un **uso sugerido**: _eje de variante_ (Material, Color,
Talla, Tamaño, Longitud: generan SKU y stock propios) o _característica descriptiva_ (Tono, Dimensiones,
Acabado, Piedra, Tipo de cierre, Género, Colección). Es una guía de la pantalla: cualquier atributo de
lista puede usarse como eje. Quien tiene `catalog:manage` crea definiciones nuevas, crea/edita/desactiva
valores (con código corto opcional) y asigna atributos a categorías (obligatorio / eje sugerido); las
definiciones base no se borran ni se desactivan. Los valores de las listas los entrega el cliente.

**Categorías (P-04, B1).** Dos niveles. Las crean, editan y desactivan Administrador y Responsable.

**Nombre del producto (B4).** `<Tipo de pieza> <rasgo principal> <modelo>`, sin repetir lo que ya está en
atributos o en la variante («Anillo corazón con circonia», «Cadena cubana»).

**Stock mínimo (B10).** Por variante; 0 = alerta desactivada. Lo modifica quien tiene `catalog:manage`.
**Precio de venta:** neto (antes de impuestos); 0 está permitido pero la pieza «no tiene precio» (D9).

**Códigos (Q-10).** SKU automático correlativo. La variante guarda como código de barras el **código del
proveedor** si existe y es único; si ya pertenece a otra pieza **no se guarda**, se avisa y la pieza se
identifica por su SKU (el código se conserva en `supplier_products` si se conoce el proveedor). La
búsqueda unificada acepta SKU, código de barras o código del proveedor. Sin número de serie ni lotes (Q-03).

**Etiquetas (Q-10 A, B7).** Todas las piezas: solo Code 128 del SKU + el SKU legible (ni precio ni nombre).
Tamaño configurable por navegador (50 × 25 mm por defecto); impresión desde el navegador, una etiqueta por
página (`@page`); PDF a través de «Guardar como PDF» del navegador.

**Ficha incompleta (C1, P-41).** Un producto está **incompleto** si se cumple **cualquiera** de dos señales: la
marca manual `profileIncomplete` (nace en el alta rápida de piezas dentro de un ingreso y se limpia al marcar la
ficha como completa con `PATCH /products/:id`) o el cálculo `isIncomplete` (sin descripción **y** sin ningún valor
de característica descriptiva). Es independiente de **«Sin precio»**: alguna variante _activa_ con precio 0.
Ambas son insignias en el listado y la ficha, tienen filtro y se cuentan (sin costos) en el Inicio de quien
gestiona el catálogo; los productos inactivos no se cuentan. No bloquean ingresos ni stock.

**Eliminación física (B11).** Solo el Administrador (`catalog:delete`) y solo si ni el producto ni sus
variantes tienen movimientos, saldo distinto de cero, ítems de ingresos ni registros de conteo. En otro
caso se debe dejar el stock en cero con un ajuste y **desactivar**.

## Fotos de producto (S3, Q-09)

Cada **producto** (no cada variante) puede tener hasta **5 fotos** JPG, PNG o WebP de hasta 5 MB; una es la
**portada** (la primera que se sube lo es) y se muestra como miniatura en el listado. Quien tiene
`catalog:manage` (Administrador y Responsable de inventario) las sube, cambia la portada, las reordena y las
elimina; todos los que ven el catálogo, incluido el Vendedor, las ven. El sistema las reduce a unos 1200 px y
las guarda dentro de la base de datos ([ADR-020](../decisions/ADR-020-fotos-de-producto.md)); al subir se
descarta cualquier dato oculto de la imagen (ubicación, cámara). Eliminar físicamente un producto (B11)
elimina también sus fotos. Al dar de alta una pieza nueva dentro de un ingreso, quien tiene `catalog:manage`
puede adjuntar sus fotos (opcional, 9.1) con el mismo componente, una vez creada la pieza. Además, la **foto de
la pieza** (su portada) aparece en las pantallas que muestran piezas: Inventario, Movimientos, Inicio, Ajustes,
Precios, Ingresos, Conteos y Etiquetas; si no tiene fotos se muestra una imagen «Sin foto».

## Inventario: movimientos, nunca ediciones

```
Stock inicial      +10   → 10
Entrada (ingreso)   +5   → 15
Venta*              −2   → 13
Cambio*             +1   → 14
Pérdida             −1   → 13      (* tipos reservados para la fase de ventas)
```

- El stock **no se edita**: cada cambio es un movimiento con tipo, cantidad, fecha, usuario,
  variante, referencia al documento origen, motivo y observación.
- Los movimientos son **append-only** (la BD impide modificarlos o borrarlos). Un error se corrige
  con un movimiento compensatorio.
- El saldo (`inventory_balances`) se actualiza **en la misma transacción** que el movimiento.
- El stock no puede ser negativo (P-08 aprobado) y se controla por piezas enteras (P-09 aprobado).

Tipos de movimiento: `INITIAL_STOCK`, `STOCK_ENTRY`, `ADJUSTMENT`, `COUNT_ADJUSTMENT`, `LOSS`,
`EXCHANGE_IN` y `EXCHANGE_OUT` (cambios de pieza); y reservados sin uso: `SALE`, `CUSTOMER_RETURN`, `EXCHANGE`.

### Cambios de pieza (C9, Q-12 A, 12.1 A; [ADR-019](../decisions/ADR-019-cambios-de-pieza.md))

- **No hay devoluciones, solo cambios**: el cliente trae una pieza y se le entrega otra en su lugar.
- Un cambio es **una operación con dos movimientos atómicos**: entra la pieza devuelta
  (`EXCHANGE_IN`, vuelve al stock **vendible**, 12.1 A) y sale la entregada (`EXCHANGE_OUT`). Si la
  salida dejara el saldo negativo, no se aplica ninguno.
- Las dos piezas deben ser variantes distintas y activas, con cantidades enteras mayores que cero
  (pueden diferir: un anillo por dos aretes). El motivo es obligatorio.
- Los dos movimientos comparten `reference_type = 'EXCHANGE'` y un `reference_id` común, y llevan el
  costo vigente de cada variante (informativo): **un cambio no recalcula costos**.
- `POST /inventory/exchanges` (`inventory:exchange`: Administrador y Responsable) es una herramienta
  de **inventario**, sin venta ni dinero. El cambio en el mostrador, ligado a una venta y con cobro de
  la diferencia, es el de ADR-026 (abajo); P-30 quedó resuelta el 2026-11-14.

### Cambio de pieza de una venta (ADR-026; política de la tienda, 2026-11-14)

- **No hay devoluciones en la tienda; solo cambio de pieza.** Ejemplo: el cliente compró un anillo
  talla 10 y necesitaba la 12: se cambia. Lo indicó el asesor legal; el comprobante lo dice al pie.
- Se cambia **con el comprobante de la venta** y **sin plazo** por ahora.
- La pieza nueva debe costar **igual o más** que lo que el cliente pagó; **nunca** se cambia por una
  pieza más económica. Si cuesta más, el cliente **paga la diferencia** (efectivo, QR o transferencia)
  y entra a la caja abierta.
- Lo registra **el mismo vendedor** (la pieza ya está contabilizada). La pieza devuelta vuelve al stock
  vendible sin revisión previa.
- Es un documento aparte (`CMB-000001`) con su comprobante; **la venta original no se modifica**
  (DEC-V07). Un cambio no se deshace.
- No se pueden cambiar más unidades de las que se vendieron; una pieza recibida en un cambio puede
  volver a cambiarse (al precio al que se entregó).

## Flujo de ingreso de mercadería

```
Proveedor → Llegada → Documento de recepción → Verificación física → Identificación de productos
   → (existentes | nuevos activos creados por inventario, P-24) → Cantidades (esperada vs. recibida) → Costos
   → Revisión de diferencias → CONFIRMACIÓN → movimientos STOCK_ENTRY → stock actualizado
```

- Estados: `DRAFT` → `CONFIRMED` | `CANCELLED`.
- **El stock aumenta únicamente al confirmar.** Crear o editar un ingreso en borrador no afecta stock.
- Un ingreso confirmado no se edita; se corrige con ajustes.
- Confirmar requiere el permiso `stock-entries:confirm` y queda auditado.
- El encargado de inventario puede agregar piezas no esperadas y crear productos activos durante la recepción mediante el **alta rápida** (P-24 cerrada, ver más abajo): pide solo categoría, nombre, costo y cantidad, y la ficha queda marcada como incompleta sin bloquear la confirmación.
- Moneda de compra por ingreso: bolivianos o dólares (Q-07). En dólares se registra el **tipo de cambio de ese ingreso** (Bs por USD, manual, hasta 4 decimales); queda fijo al confirmar. Se guardan el precio original, el tipo de cambio y el equivalente en Bs; costos, stock y precios del sistema se llevan en Bs. La moneda habitual del proveedor solo se sugiere.
- Costos adicionales: **lista abierta** de líneas (tipo + monto en Bs + nota): Transporte, Embolsado, Aduanización, Comisiones, Otro y los tipos que agregue el Administrador (Q-08). Son montos, no porcentajes.
- Prorrateo **por valor** de compra en Bs entre ítems (centavos por mayor resto) y **último costo** para la variante (P-07, ADR-015, ADR-016). El panel de costos muestra por ítem el precio de compra (original y Bs), el subtotal, los costos adicionales asignados, el costo total y el costo unitario total, antes de confirmar y después.
- Diferencia entre cantidad esperada y recibida: justificación obligatoria en texto libre para confirmar (C2).
- Fecha del documento: no futura y hasta 30 días atrás (zona La Paz); la fecha de auditoría es la real (C6).
- Entregas parciales: cada una es un ingreso independiente y puede repetir el número de comprobante del proveedor (C5). Confirma quien registra (C3); lo confirmado se corrige solo con un ajuste (C4).
- **Alta rápida de pieza nueva (C1 / P-24 cerrada):** con categoría, nombre, costo y cantidad (código del proveedor opcional) se crea el producto activo con una variante, SKU correlativo, precio de venta 0 y marca «ficha incompleta»; la pieza no se bloquea. Si el código del proveedor ya identifica a otra pieza no se guarda como código de barras y se avisa (Q-10b).
- **Historial de costos (C10):** cada variante muestra sus compras confirmadas (fecha, ingreso, proveedor, cantidad, precio original y en Bs, costos adicionales y costo total unitario). Solo con `costs:read`.

## Costos y precios

- Costo total unitario = costo de compra en Bs (precio × tipo de cambio si fue en dólares) + costos adicionales prorrateados por valor (P-07, ADR-016).
- Precio de venta: lo **fija el cliente a mano** por variante (un solo precio, **neto**, en Bs; sin listas de precios). Precio 0 = «Sin precio»: válido, pero la pieza no será vendible en la Fase 2 hasta tener precio (D9).
- Las compras pueden ser en dólares (P-10 reabierto, Q-07); costos, stock y precios de venta siempre en bolivianos.
- **No hay fórmula, multiplicador, redondeo ni sugerencia de precio** (P-03 sustituida por Q-04/Q-05). Para decidir el precio el sistema muestra, solo con `costs:read`: precio de compra unitario y subtotal del último ingreso, costos adicionales por pieza y **costo total unitario**; y la **ganancia** del precio vigente y del nuevo: **Ganancia en Bs** y **% sobre el costo total** (costo 0 → «—»). Una ganancia negativa se advierte, no se bloquea.
- **Aprobación de precios (P-25 cerrada, [ADR-018](../decisions/ADR-018-aprobacion-e-historial-de-precios.md)):** quien tiene `prices:propose` **solicita** (uno o varios) y quien tiene `prices:approve` —el Administrador **o** el Responsable de inventario, regla de autorización compartida del 2026-11-05— **aprueba o rechaza** (uno a uno o en masa; el rechazo exige comentario). Quien aprueba también puede **cambiar directamente** («Cambio directo (con autorización)»), aunque sea quien lo modifica: queda aprobado por él mismo, y el Responsable puede aprobar sus propias solicitudes (riesgo aceptado, P-43). Vigencia inmediata, sin umbrales. Una variante admite una sola solicitud pendiente; el solicitante puede cancelarla.
- **Historial de precios** en entidad propia (`price_changes`, inmutable): precio anterior y nuevo, estado, origen (solicitud, cambio directo, precio inicial), quién solicitó y decidió, fechas, comentario y costo total del momento (solo con `costs:read`). El precio inicial al crear una pieza lo fija solo quien puede aprobar precios.
- Todo cambio de costo/precio queda en auditoría (anterior → nuevo).

## Flujo de inventario físico (conteo a ciegas, ADR-021)

```
Crear conteo por categoría (DRAFT) → Iniciar (IN_PROGRESS: foto del sistema + cursor de movimientos)
  → Captura a ciegas con lector → Cerrar conteo
       ├─ sin diferencias → IN_REVIEW
       └─ con diferencias → RECOUNT (segundo recuento obligatorio, a ciegas, solo esas variantes) → IN_REVIEW
  → Aprobar (APPROVED) → un movimiento COUNT_ADJUSTMENT por variante con diferencia
  → o Cancelar (CANCELLED) en cualquier momento: no mueve stock
```

- **Alcance:** por categoría o subcategoría; una categoría padre incluye a sus hijas. No hay conteo
  «total» (para todo, se elige la categoría raíz). Incluye las variantes **activas** y las **inactivas con
  saldo > 0**. Varios conteos a la vez solo si no comparten variantes (Q-13 B).
- **A ciegas:** durante la captura y el recuento nadie —ni el Administrador— ve la cantidad del sistema ni
  las diferencias; solo la revisión del aprobador. El valor del **recuento prevalece**. Las variantes sin
  lecturas cuentan como 0.
- **Un solo operador** por conteo, con lector de códigos (SKU, código de barras o código de proveedor).
  Cada lectura se guarda al instante: si caduca la sesión o se cierra el navegador se reanuda sin pérdida.
- **Hallazgos:** un código inexistente o de otra categoría no afecta el stock; queda registrado y el
  aprobador lo marca como regularizado (con nota) cuando se resuelva manualmente.
- **Conciliación (P-13):** no se bloquean movimientos. Al aprobar se calcula, por variante,
  `esperado = saldo vigente − movimientos posteriores al momento de contar` y
  `diferencia = conteo final − esperado`: un ingreso confirmado durante el conteo no es una diferencia.
- **Aprobación:** el Responsable de inventario o el Administrador (`inventory-counts:approve`, P-01 / E6).
  Un solo paso atómico, sin saldo negativo, con auditoría; doble aprobación imposible.
- Cada ajuste registra **quién, cuándo, qué variante, cantidad anterior, cantidad nueva, diferencia y
  motivo** (`Conteo CNT-000001`); costo y valor de las diferencias solo con `costs:read`.
- Número correlativo automático `CNT-000001` (P-11).

## Ajustes manuales (Q-01 B, ADR-017)

```
Quien tiene inventory:adjust SOLICITA (PENDING) → quien tiene inventory:adjust-approve APRUEBA
                                                    → movimientos ADJUSTMENT (el stock cambia aquí)
                                                  ├→ RECHAZA con comentario (REJECTED)
                                                  └→ quien solicitó CANCELA (CANCELLED)
```

- **Regla de autorización compartida (cliente, 2026-11-05, posterior a Q-01 B):** el **Administrador y el
  Responsable de inventario** pueden solicitar y también aprobar o rechazar (`inventory:adjust-approve`),
  incluidos sus propios ajustes. Así no se bloquea un ajuste esperando a una sola persona. Un rol que solo
  tenga `inventory:adjust` (p. ej. un rol personalizado) solicita y otra persona decide. La auditoría deja
  trazable quién pidió y quién aprobó (riesgo aceptado, P-43). El **stock cambia únicamente al aprobar**.
- Lo mismo vale para el **stock inicial** (`inventory:initial-stock`, P-40) y los **conteos**. Sigue siendo
  exclusivo del Administrador: auditoría, usuarios/roles, borrado físico y configuración.
- Un ajuste puede tener varias variantes; cada línea es una diferencia con signo (negativa = sale). Un
  solo **motivo** del catálogo (Robo, Pérdida, Muestra, Rotura, Error de registro, Otro) y una
  **observación** libre, obligatoria si el motivo es «Otro».
- **Nunca stock negativo**: se valida al solicitar y se **vuelve a validar al aprobar** con el saldo
  vigente, porque el stock pudo cambiar entre ambos momentos. Si no alcanza, no se aprueba.
- **Trazabilidad:** quién solicitó y cuándo, quién resolvió y cuándo, variante, cantidad anterior y
  nueva, diferencia, motivo, observación y comentario de rechazo; costo y valor solo con `costs:read`.
- **Descontinuar** (B11): atajo «Ajustar a cero» desde Inventario (solicita la salida de todo el saldo);
  luego se desactiva la ficha. El sistema impide desactivar un producto o una variante con stock > 0 (P-22,
  implementada; error `STOCK_BLOCKS_DEACTIVATION`).
- Un ajuste aprobado no se edita: se corrige con otro ajuste.

## Control

Estado de las consultas de control de la Fase 1:

- Variantes **sin stock** (`quantity = 0`): **implementada** como filtro por nivel en Inventario
  (`GET /inventory?level=OUT`) y como contador y tabla de piezas en alerta en el Inicio.
- Variantes **bajo stock mínimo** (`quantity <= min_stock`, con mínimo mayor que 0): **implementada** igual que la
  anterior (`level=LOW`).
- **Historial** de movimientos: **implementado** por variante (`GET /inventory/:variantId/movements`) y global
  (`GET /inventory/movements`, pantalla `/inventario/movimientos`), con paginación. Los filtros por tipo, usuario
  y rango de fechas **no existen** todavía; los reportes y exportaciones siguen pendientes.
- Auditoría de acciones por usuario y entidad: **implementada** como pantalla `/auditoria` **solo para el Administrador** (Q-15.3). Filtra por usuario, acción (exacta o por prefijo), tipo e ID de entidad y rango de fechas (hora de La Paz), y cada registro muestra quién, cuándo, IP, ID de petición y el antes/después campo por campo. Es de solo lectura y se guarda indefinidamente (P-23). Las claves sensibles (contraseñas, tokens, cookies) nunca se muestran.

## Fuera de alcance de la Fase 1

Punto de venta, facturación, Impuestos Nacionales, contabilidad, múltiples sucursales, app móvil,
IA, compras automáticas, integraciones bancarias. La arquitectura los contempla (ver
`docs/architecture/ARCHITECTURE.md` § Evolución), pero no se desarrollan.

# Dominio de negocio — Fase 1: Inventario y Control de Productos

Este documento describe **conceptos y flujos**. Las reglas no confirmadas se marcan
**PENDIENTE (P-xx)** y están detalladas en [PENDIENTES.md](PENDIENTES.md). Aplicar también las [resoluciones del 2026-10-11](RESOLUCIONES-2026-10-11.md).

## Glosario

| Término                  | Significado                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Producto**             | Ficha comercial: nombre, descripción, modelo, categoría, atributos comunes. No tiene stock propio.                                                                                                                                                                                        |
| **Variante**             | Unidad controlable de inventario. Tiene SKU, código de barras, stock, stock mínimo, costo, precio y estado. Todo producto tiene ≥ 1 variante.                                                                                                                                             |
| **Eje de variante**      | Atributo que diferencia variantes de un mismo producto (material, talla, longitud...).                                                                                                                                                                                                    |
| **Atributo descriptivo** | Atributo común a todas las variantes del producto (colección, género, tipo de cierre...).                                                                                                                                                                                                 |
| **SKU**                  | Código interno único por variante, generado con correlativo automático. Formato técnico actual: `SKU-000001`.                                                                                                                                                                             |
| **Etiqueta propia**      | Code 128 con el SKU de la variante. La continuidad del código del proveedor para búsqueda sigue por confirmar (P-06).                                                                                                                                                                     |
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

**Ficha incompleta (C1).** Un producto está **incompleto** si no tiene descripción **y** ningún valor de
característica descriptiva. Es independiente de **«Sin precio»**: alguna variante _activa_ con precio 0.
Ambas son insignias en el listado y la ficha, tienen filtro y se cuentan (sin costos) en el Inicio de quien
gestiona el catálogo; los productos inactivos no se cuentan. No bloquean ingresos ni stock.

**Eliminación física (B11).** Solo el Administrador (`catalog:delete`) y solo si ni el producto ni sus
variantes tienen movimientos, saldo distinto de cero, ítems de ingresos ni registros de conteo. En otro
caso se debe dejar el stock en cero con un ajuste y **desactivar**.

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

Tipos de movimiento: `INITIAL_STOCK`, `STOCK_ENTRY`, `ADJUSTMENT`, `COUNT_ADJUSTMENT`, `LOSS`; y
reservados: `SALE`, `CUSTOMER_RETURN`, `EXCHANGE`.

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
- El encargado de inventario puede agregar piezas no esperadas y crear productos activos durante la recepción. Para fichas sin información completa falta precisar los datos mínimos antes de confirmar (P-24).
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
- **Aprobación de precios (P-25 cerrada, [ADR-018](../decisions/ADR-018-aprobacion-e-historial-de-precios.md)):** el Responsable de inventario **solicita** (uno o varios) y solo el Administrador **aprueba o rechaza** (uno a uno o en masa; el rechazo exige comentario). El Administrador también puede **cambiar directamente**, aunque sea quien lo modifica: queda aprobado por él mismo. Vigencia inmediata, sin umbrales. Una variante admite una sola solicitud pendiente; el solicitante puede cancelarla.
- **Historial de precios** en entidad propia (`price_changes`, inmutable): precio anterior y nuevo, estado, origen (solicitud, cambio directo, precio inicial), quién solicitó y decidió, fechas, comentario y costo total del momento (solo con `costs:read`). El precio inicial al crear una pieza lo fija solo quien puede aprobar precios.
- Todo cambio de costo/precio queda en auditoría (anterior → nuevo).

## Flujo de inventario físico

```
Crear inventario (DRAFT) → Iniciar (IN_PROGRESS: snapshot del stock del sistema)
  → Conteo (cantidades contadas, quién, cuándo) → Revisión (IN_REVIEW: diferencias)
  → Aprobación autorizada (APPROVED) → movimientos COUNT_ADJUSTMENT por cada diferencia
```

- No hay ajustes arbitrarios: cada ajuste registra **quién, cuándo, qué variante, cantidad anterior,
  cantidad nueva, diferencia, motivo y observación** (el movimiento guarda `balance_before`,
  `balance_after`, `quantity`, `reason`, `notes`, `user_id`, `created_at`).
- El responsable de almacén puede aprobar sus propios conteos físicos (P-01 parcial). Durante el conteo siguen permitidos los movimientos; la aprobación concilia los ocurridos desde el snapshot (P-13). El alcance del conteo sigue pendiente.

## Ajustes manuales (Q-01 B, ADR-017)

```
Responsable SOLICITA (PENDING) → Administrador APRUEBA → movimientos ADJUSTMENT (el stock cambia aquí)
                               ├→ Administrador RECHAZA con comentario (REJECTED)
                               └→ quien solicitó CANCELA (CANCELLED)
```

- El **Responsable solicita** (`inventory:adjust`); **solo el Administrador aprueba o rechaza**
  (`inventory:adjust-approve`) y puede aprobar los suyos. El **stock cambia únicamente al aprobar**.
- Un ajuste puede tener varias variantes; cada línea es una diferencia con signo (negativa = sale). Un
  solo **motivo** del catálogo (Robo, Pérdida, Muestra, Rotura, Error de registro, Otro) y una
  **observación** libre, obligatoria si el motivo es «Otro».
- **Nunca stock negativo**: se valida al solicitar y se **vuelve a validar al aprobar** con el saldo
  vigente, porque el stock pudo cambiar entre ambos momentos. Si no alcanza, no se aprueba.
- **Trazabilidad:** quién solicitó y cuándo, quién resolvió y cuándo, variante, cantidad anterior y
  nueva, diferencia, motivo, observación y comentario de rechazo; costo y valor solo con `costs:read`.
- **Descontinuar** (B11): atajo «Ajustar a cero» desde Inventario (solicita la salida de todo el saldo);
  luego se desactiva la ficha. Impedir desactivar con stock > 0 es otra regla (P-22).
- Un ajuste aprobado no se edita: se corrige con otro ajuste.

## Control

Consultas previstas para la Fase 1 (sin implementar aún):

- Variantes **sin stock** (`quantity = 0`).
- Variantes **bajo stock mínimo** (`quantity <= min_stock`).
- **Historial** de movimientos por variante, tipo, usuario y rango de fechas.
- Auditoría de acciones por usuario y entidad.

## Fuera de alcance de la Fase 1

Punto de venta, facturación, Impuestos Nacionales, contabilidad, múltiples sucursales, app móvil,
IA, compras automáticas, integraciones bancarias. La arquitectura los contempla (ver
`docs/architecture/ARCHITECTURE.md` § Evolución), pero no se desarrollan.

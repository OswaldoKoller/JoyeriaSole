# Dominio de negocio — Fase 1: Inventario y Control de Productos

Este documento describe **conceptos y flujos**. Las reglas no confirmadas se marcan
**PENDIENTE (P-xx)** y están detalladas en [PENDIENTES.md](PENDIENTES.md). Aplicar también las [resoluciones del 2026-10-11](RESOLUCIONES-2026-10-11.md).

## Glosario

| Término                  | Significado                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Producto**             | Ficha comercial: nombre, descripción, modelo, categoría, atributos comunes. No tiene stock propio.                                            |
| **Variante**             | Unidad controlable de inventario. Tiene SKU, código de barras, stock, stock mínimo, costo, precio y estado. Todo producto tiene ≥ 1 variante. |
| **Eje de variante**      | Atributo que diferencia variantes de un mismo producto (material, talla, longitud...).                                                        |
| **Atributo descriptivo** | Atributo común a todas las variantes del producto (colección, género, tipo de cierre...).                                                     |
| **SKU**                  | Código interno único por variante, generado con correlativo automático. Formato técnico actual: `SKU-000001`.                                 |
| **Etiqueta propia**      | Code 128 con el SKU de la variante. La continuidad del código del proveedor para búsqueda sigue por confirmar (P-06).                         |
| **Movimiento**           | Registro inmutable de un cambio de stock (+ entrada / − salida).                                                                              |
| **Saldo (balance)**      | Stock actual de una variante = suma de sus movimientos.                                                                                       |
| **Ingreso**              | Recepción de mercadería de un proveedor con su documento de respaldo.                                                                         |
| **Inventario físico**    | Conteo real comparado contra el sistema para detectar y corregir diferencias.                                                                 |

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
- Costos: unitario de compra por ítem + transporte/embolsado/otros a nivel del ingreso.
  Prorrateo **por valor** de compra entre ítems y **último costo** para la variante (P-07 aprobado; implementación pendiente).

## Costos y precios

- Costo total unitario = costo de compra + transporte, embolsado y otros costos prorrateados por valor (P-07).
- Precio de venta: se guarda **explícitamente** por variante.
- La moneda de la Fase 1 es solo bolivianos (P-10 aprobado).
- Precio base **(costo de compra + transporte + embolsado + valores extras) × 2**. El cliente puede modificar el precio y definir un cálculo propio por categoría (P-03); falta especificar redondeo.
- Los cambios de precio requieren aprobación (P-25). El aprobador y la entrada en vigencia siguen pendientes; la fórmula no se aplica automáticamente antes de definir ese flujo.
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
- El responsable de almacén puede aprobar sus propios conteos físicos y ajustes manuales (P-01). Durante el conteo siguen permitidos los movimientos; la aprobación concilia los ocurridos desde el snapshot (P-13). El alcance del conteo sigue pendiente.

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

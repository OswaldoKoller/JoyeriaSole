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
- En la Fase 1 solo existe la base y la API (`inventory:exchange`: Administrador y Responsable); no hay
  pantallas de registro ni punto de venta. Quién registra cambios en el futuro punto de venta es la
  decisión pendiente P-30.

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

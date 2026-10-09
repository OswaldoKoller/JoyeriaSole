# ADR-006: Sistema de atributos

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Contexto

Cada tipo de producto usa atributos distintos (anillo: talla/material/piedra; cadena:
longitud/material; polo: talla/color/género). Columnas fijas dejarían la mayoría vacías y obligarían a
migrar por cada atributo nuevo.

## Decisión

Modelo de atributos **tipados y controlados** (EAV acotado):

- `attributes`: definición con tipo `OPTION | TEXT | NUMBER | BOOLEAN` y unidad opcional.
- `attribute_options`: lista cerrada de valores para `OPTION` (evita "Plata 925" vs. "plata925").
- `category_attributes`: plantilla de atributos sugeridos por categoría (requeridos, ejes por defecto).
- `product_variant_axes` + `variant_attribute_values`: atributos que **diferencian variantes** (solo `OPTION`).
- `product_attribute_values`: atributos **descriptivos** comunes al producto (CHECK: un único valor).

## Alternativas consideradas

- Columnas fijas por atributo: tablas anchas y vacías; migración por cada atributo nuevo.
- JSONB libre en el producto: sin integridad ni listas de valores; filtros y reportes frágiles.

## Consecuencias

- Nuevos atributos y valores se agregan como datos, sin migración.
- Filtrar por atributo requiere joins (indexados por `attribute_id, option_id`).
- Peso, quilataje, etc. (P-27) pueden ser atributos NUMBER con unidad.

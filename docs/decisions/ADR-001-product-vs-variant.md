# ADR-001: Producto vs. variante

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Contexto

Una joyería vende el mismo modelo en varios materiales, tallas o longitudes ("Anillo Solitario
Circona" en Plata 925 / Oro 18K, tallas 16 / 18). Cada combinación tiene su propio stock, costo,
precio, SKU y código de barras.

## Decisión

Dos niveles:

- **Producto** (`products`): ficha comercial — nombre, descripción, modelo, categoría, atributos
  descriptivos comunes. **No tiene stock.**
- **Variante** (`product_variants`): unidad controlable de inventario — SKU único, código de barras
  único opcional, costo, precio, stock mínimo, estado. El stock (`inventory_balances`) y los
  movimientos referencian **siempre a la variante**.

Todo producto tiene al menos una variante; un producto "simple" tiene exactamente una, sin ejes.
Los ejes que generan variantes se definen por producto (`product_variant_axes`) y cada variante guarda
su valor por eje (`variant_attribute_values`, solo atributos OPTION). La unicidad de la combinación de
ejes dentro de un producto se valida en el servicio.

## Alternativas consideradas

- Stock en el producto y variantes opcionales: dos caminos de código para el stock, fuente de errores.
- Una fila por combinación sin producto padre: duplica descripción/categoría y complica búsquedas.

## Consecuencias

- Un solo modelo de inventario para todo el catálogo.
- La UI debe ocultar la complejidad en productos de una sola variante.
- El lector de códigos resuelve directamente una variante (barcode → variante).

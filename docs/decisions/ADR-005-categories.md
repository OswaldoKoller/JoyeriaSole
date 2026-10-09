# ADR-005: Categorías como árbol

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Decisión

Una sola tabla `categories` con `parent_id` auto-referenciado. Una subcategoría es una categoría con
padre. Nombre único entre hermanos; `slug` único global. Borrado restringido si tiene hijos o productos.

## Alternativas consideradas

- Tablas separadas `categories` / `subcategories`: fija dos niveles para siempre y duplica lógica.

## Consecuencias

- Soporta 2 o más niveles sin migración. La profundidad máxima (P-04) la validará el servicio.
- Los productos se asignan a una categoría (se recomienda una hoja; regla a definir con P-04).

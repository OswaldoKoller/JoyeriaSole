# ADR-015: Reparto de centavos por mayor resto y bloqueo con valor cero

- **Estado:** Aceptado (decisión del cliente del 2026-10-11)
- **Fecha:** 2026-10-11
- **Complementa:** [ADR-013](ADR-013-costeo-ingresos.md), que dejaba abiertos el redondeo, el reparto de residuos de centavos y el ingreso con valor de compra cero.

## Contexto

ADR-013 reparte los costos adicionales de un ingreso (transporte, embolsado y extras) **en proporción al valor de compra de cada ítem**. Al repartir importes en centavos casi nunca se obtienen partes exactas, y la suma de las partes redondeadas puede diferir del total en uno o varios centavos. Además, si todos los ítems valen cero no existe base de reparto.

## Decisión

### Reparto por mayor resto

1. El valor de cada ítem es `cantidad recibida × costo unitario de compra` (el costo unitario admite hasta 4 decimales).
2. La parte exacta de cada ítem es `costos adicionales × valor del ítem ÷ valor total`.
3. Cada ítem recibe primero la parte **entera en centavos** (sin redondear hacia arriba).
4. Los centavos que sobran para igualar el total se entregan **de a uno** a los ítems con **mayor resto** (la fracción de centavo descartada en el paso 3).
5. Desempate, para que el resultado sea siempre el mismo: mayor valor de ítem y, después, orden estable por identificador de variante.
6. La suma de las partes iguala **exactamente** el total de costos adicionales.
7. El costo adicional unitario es `parte ÷ cantidad recibida`, redondeado a 4 decimales (mitad hacia arriba). El **costo unitario total** es `costo unitario de compra + costo adicional unitario` y pasa a ser el último costo de la variante (ADR-013).

La aritmética se hace con enteros exactos (sin números de coma flotante), de modo que API e interfaz calculan lo mismo.

### Ingreso con valor de compra cero

Si el ingreso tiene costos adicionales mayores que cero y el valor de compra de todos sus ítems es cero, **no se puede confirmar**: se exige al menos un ítem con costo mayor que cero. No se reparte por cantidad ni se dejan costos sin asignar. Sin costos adicionales, un ingreso con costo cero sí puede confirmarse.

## Alternativas consideradas

- Redondeo simple con ajuste al ítem más caro: concentra todo el ajuste en un ítem.
- Sin redondeo (4 decimales por unidad): la suma en centavos puede no cuadrar con el documento.
- Repartir por cantidad cuando el valor es cero: supone una regla que el cliente no aprobó.

## Consecuencias

- Ningún centavo se pierde ni se inventa: la suma de partes es siempre el total.
- Por el redondeo a 4 decimales del costo unitario, `costo adicional unitario × cantidad` puede diferir de la parte asignada en una fracción de centavo. La parte exacta en centavos solo existe durante el cálculo; lo que se guarda es el costo unitario (en el ítem y en el movimiento).
- Confirmar un ingreso no modifica el precio de venta (P-25 sigue pendiente).

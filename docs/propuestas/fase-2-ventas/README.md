# Fase 2 «Ventas» · Paquete de análisis para revisión

Fecha de corte: 2026-11-09 · Base: resolución formal del responsable del proyecto del 07/11/2026 (Q-V07, Q-V09 y Q-V12) y confirmaciones previas Q-V01 a Q-V05.

> **Alcance autorizado: SOLO ANÁLISIS Y DOCUMENTOS PARA REVISIÓN.**
> Nada de esta carpeta autoriza modificar código, crear migraciones o endpoints, alterar permisos, editar ADR, `PENDIENTES.md`, `CLAUDE.md` o `CHANGELOG`, hacer commit, ejecutar pruebas o Docker, ni desplegar. Los documentos son **propuestas**; ningún ADR 022+ existe en `docs/decisions/` (solo 001 a 021).

Etiquetas usadas en todo el paquete: **[CONFIRMADA]** (lo dijo el responsable), **[RECOMENDACIÓN TÉCNICA]** (propuesta del arquitecto, no es regla), **[PENDIENTE]** (requiere decisión).

## Índice de los 8 documentos

| #   | Archivo                                                            | Contenido                                                                                                                                                                | Estado de este archivo |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 1   | [`01-matriz-de-decisiones.md`](01-matriz-de-decisiones.md)         | Matriz Q-V01…Q-V17 y DEC-V07/V09/V12; verificación en el repositorio; clasificación de propuestas de anulación; contradicciones con acciones documentales (sin ejecutar) | Escrito                |
| 2   | `02-diseno-funcional-caja.md`                                      | Diseño funcional del módulo de caja (DEC-V09)                                                                                                                            | Lo escribe otro agente |
| 3   | `03-modelo-de-datos-ventas-y-caja.md`                              | Propuesta del modelo de datos de ventas y caja                                                                                                                           | Lo escribe otro agente |
| 4   | `04-especificacion-comprobante-interno.md`                         | Especificación del comprobante interno (DEC-V12)                                                                                                                         | Lo escribe otro agente |
| 5   | `05-impacto-prohibicion-anulaciones.md`                            | Análisis de impacto de la prohibición de anulaciones (DEC-V07)                                                                                                           | Lo escribe otro agente |
| 6   | [`06-roadmap-actualizado.md`](06-roadmap-actualizado.md)           | E0 a E7 y Fase 3; **conflicto de orden E1/E3**; E0 detallada; restricción «E2 excluida»                                                                                  | Escrito                |
| 7   | `07-matriz-de-riesgos.md`                                          | Matriz de riesgos (resolución §6)                                                                                                                                        | Lo escribe otro agente |
| 8   | [`08-subdecisiones-pendientes.md`](08-subdecisiones-pendientes.md) | Subdecisiones pendientes consolidadas y priorizadas; advertencia legal                                                                                                   | Escrito                |

Los enlaces de los documentos 2, 3, 4, 5 y 7 no están activos en este archivo porque no existían al momento de escribirlo.

## Lo esencial en seis puntos

1. **[CONFIRMADA]** Q-V01 venta de mostrador con comprobante interno; Q-V02 facturación fiscal por sistema externo; Q-V03 el precio registrado es el total cobrado, sin impuestos añadidos; Q-V04 efectivo, QR, transferencia y combinaciones, solo bolivianos; Q-V05 solo ventas pagadas íntegramente (sin créditos ni apartados).
2. **[CONFIRMADA] DEC-V07**: no se anulan ventas confirmadas por el flujo ordinario. No hay `POST /sales/:id/void`, `sales:void`, `SALE_VOID`, `VOIDED` ni botones de anulación. **E2 excluida.** Las excepciones (venta errónea, pagos incorrectos, duplicaciones, devoluciones obligatorias, cambios) están **sin definir**.
3. **[CONFIRMADA en alcance principal] DEC-V09**: una caja lógica con apertura, cobros, cierre y arqueo. Ocho subdecisiones **pendientes** (roles, venta sin sesión, fondo, tolerancia, gastos y retiros, reapertura, QR/transferencia pendientes, responsabilidad por vendedor).
4. **[CONFIRMADA en el mecanismo] DEC-V12**: comprobante imprimible desde el navegador, formato configurable. Numeración y otros detalles **pendientes**; no se promete correlativo continuo.
5. **Conflicto señalado**: la resolución pone E1 antes de E3, pero la caja asocia ventas con sesión. Alternativas A/B/C en `06-roadmap-actualizado.md` §3 **para decisión del responsable**; este paquete no elige.
6. **Advertencia legal**: no se asume que la política comercial «solo cambios» excluya devoluciones o rectificaciones exigidas por ley. Consultar al contador y a un asesor legal (`08-subdecisiones-pendientes.md` §0).

## Restricciones para quien use este paquete (agentes y personas)

| Restricción                                                                                                                                                            | Fuente                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **E2 excluida: no implementar anulaciones ni mecanismos equivalentes**, incluidos los encubiertos (ajuste de inventario, cambio inverso, pagos negativos, «cancelada») | Resolución §2, §5, §9                 |
| No convertir recomendaciones en reglas ni subdecisiones pendientes en confirmadas                                                                                      | Resolución §3; CLAUDE.md              |
| No implementar nada que dependa de una decisión pendiente: detenerse y preguntar                                                                                       | CLAUDE.md «Decisiones PENDIENTES»     |
| No editar ADR aceptados (se reemplazan con uno nuevo); no editar migraciones aplicadas                                                                                 | `docs/decisions/README.md`; CLAUDE.md |
| No agregar dependencias sin justificarlas (p. ej. `fast-check` no está declarado en ningún `package.json`)                                                             | CLAUDE.md                             |
| No modificar el stock sin movimiento; no escribir el libro fuera de `modules/inventory`                                                                                | CLAUDE.md; ADR-007                    |
| Las fechas de confirmación de Q-V01 a Q-V05 no constan en el repositorio y no se inventan                                                                              | Matriz §1                             |

## Cómo se aprobará la implementación posterior

Propuesta de proceso [RECOMENDACIÓN TÉCNICA]; cada paso requiere la decisión expresa del responsable:

| Paso | Qué ocurre                                                                                                                                                                                                      | Evidencia                               |
| ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
|    1 | El responsable revisa el paquete y responde las subdecisiones (empezando por el §7 de `08`)                                                                                                                     | Resolución fechada nueva                |
|    2 | Se registra la resolución del 07/11 y las respuestas: `docs/business/RESOLUCIONES-*.md` y `PENDIENTES.md` (P-V01…)                                                                                              | Archivos actualizados con orden expresa |
|    3 | El responsable actualiza `CLAUDE.md` (fase, autorización, lista de ADR, restricción «E2 excluida»)                                                                                                              | Solo él puede hacerlo                   |
|    4 | Se redactan los ADR necesarios con `docs/decisions/TEMPLATE.md` y se aceptan antes del código (fachada de inventario, venta atómica, pagos, caja ADR-028, comprobante ADR-029 actualizado; ADR-025 no se emite) | ADR aceptados                           |
|    5 | **Autorización expresa y delimitada por etapa**: «autorizo E0», luego «autorizo E1», etc. Cada una indica alcance, rama y qué queda fuera                                                                       | Mensaje del responsable                 |
|    6 | Se ejecuta la etapa con las puertas de calidad de `06-roadmap-actualizado.md`: `npm run check`, `npm run qa` y pruebas específicas                                                                              | Resultados archivados                   |
|    7 | Revisión del arquitecto y aceptación; recién entonces se solicita la siguiente etapa                                                                                                                            | Acta                                    |

**Todavía no hay autorización de implementación de ningún tipo.** La primera etapa que podría autorizarse es E0 (estabilización del libro), y solo con orden expresa.

## Fuentes consultadas

| Fuente                                                       | Ubicación                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Resolución formal (texto íntegro, **fuera del repositorio**) | `...\scratchpad\resolucion-qv07-qv09-qv12.md` (sesión de trabajo; ver acción A-01 de la matriz)           |
| Informe 06 (§4 y §5), 04 (§8), 01, 00                        | `docs/informe-tecnico/`                                                                                   |
| Informe de arquitectura Partes A/B                           | `...\tool-results\toolu_01H7ufHvEE2AhUcr2wfy7pvW.txt` (fuera del repositorio)                             |
| ADR 001 a 021, `README.md` de decisiones                     | `docs/decisions/`                                                                                         |
| `PENDIENTES.md`, `RESOLUCIONES-2026-11-05.md`, `DOMINIO.md`  | `docs/business/`                                                                                          |
| `DATABASE.md`, `ARCHITECTURE.md`                             | `docs/database/`, `docs/architecture/`                                                                    |
| Código verificado de solo lectura                            | `apps/api/prisma/schema.prisma`, `apps/api/src/modules/**`, `packages/shared/src/**`, `package-lock.json` |

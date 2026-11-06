# ADR-021: Conteo físico a ciegas con segundo recuento

- **Estado:** Aceptado (enmienda de [ADR-009](ADR-009-physical-counts.md) y [ADR-014](ADR-014-conteos-con-movimientos.md); usa el libro de [ADR-007](ADR-007-inventory-ledger.md) y la operación `applyStockChanges` de [ADR-017](ADR-017-ajustes-solicitud-aprobacion.md))
- **Fecha:** 2026-11-05

## Contexto

El cliente definió en la reunión del 2026-11-05 (E3–E6, A4, P-01, P-11, P-13, Q-01 B, Q-13 B, Q-15 A) cómo se hace el inventario físico:

- Se cuenta **por categoría o subcategoría** (no existe el conteo «total»). Pueden convivir varios conteos solo si no comparten variantes.
- El conteo es **a ciegas**: quien cuenta, y nadie más durante la captura, ve la cantidad del sistema ni las diferencias.
- Un **solo operador** por conteo, con **lector de códigos**; cada lectura se guarda pieza por pieza para poder reanudar si caduca la sesión (8 h) o se cierra el navegador.
- Los códigos que no existen o son de otra categoría son **hallazgos**: no tocan el stock y se regularizan a mano después.
- Si el primer conteo difiere del sistema, el **segundo recuento es obligatorio**, a ciegas y solo de esas variantes; el valor del recuento prevalece.
- Aprueban el **Responsable de inventario o el Administrador**. La tienda sigue operando durante el conteo (P-13: no se bloquean movimientos).

ADR-014 fijó que se concilian los movimientos ocurridos durante el conteo, pero dejó abierto el alcance y no definió cómo registrar «el momento» de cada cantidad contada.

## Decisión

1. **Flujo de estados.** `DRAFT → IN_PROGRESS → [RECOUNT] → IN_REVIEW → APPROVED | CANCELLED`. Cerrar el primer conteo calcula, por variante, si hay diferencia; si existe alguna, pasa a `RECOUNT` (solo esas variantes); si no, directo a `IN_REVIEW`. Cerrar el recuento pasa siempre a `IN_REVIEW`. Cancelar es posible en cualquier estado no terminado y nunca mueve stock. Numeración correlativa automática `CNT-000001` (P-11).
2. **Alcance y solapamientos.** `inventory_counts.category_id` apunta a la categoría; el conteo incluye a las subcategorías de cualquier profundidad. Al **iniciar** se materializa una línea por cada variante **activa** del alcance y por cada variante **inactiva con saldo > 0**. Al **crear** y al **iniciar** se rechaza (409, con el número del conteo en conflicto) si alguna variante ya está en otro conteo no terminado; los borradores se comparan por su alcance calculado en ese momento. Un `pg_advisory_xact_lock` serializa estas comprobaciones, de modo que dos creaciones o inicios simultáneos no se cruzan. La lógica de detección es una función pura (`findScopeOverlaps`).
3. **Ciego por construcción.** La respuesta de detalle es una unión discriminada: en `DRAFT`, `IN_PROGRESS`, `RECOUNT` y `CANCELLED` es `view: 'BLIND'` y **no contiene** ningún campo de stock del sistema, esperado ni diferencia (no es «null», el campo no existe); solo `IN_REVIEW` y `APPROVED` devuelven `view: 'REVIEW'`. Rige para todos los roles, incluido el Administrador. Durante la captura la lista solo muestra las piezas con lecturas (el recuento muestra las piezas a recontar, sin el valor del primer conteo). Las pruebas inspeccionan las respuestas JSON buscando esos campos.
4. **Operador único.** `inventory_counts.operator_id` (quien inicia, o quien lo toma con `POST /:id/take`, que queda auditado). Escanear, fijar, deshacer, cerrar y anotar hallazgos exigen ser el operador (403 con el nombre de quien captura). Un CHECK garantiza operador mientras está en captura/recuento.
5. **Lecturas pieza por pieza.** `inventory_count_scans` guarda cada lectura (variante o hallazgo, ronda, código, origen `SCAN`/`MANUAL`, delta, cantidad resultante, usuario, hora). `POST /:id/scan {code}` resuelve el código por **SKU** (sin distinguir mayúsculas), **código de barras** o **código de proveedor** (si este último corresponde a varias piezas se rechaza, no se adivina) y suma 1. `PUT /:id/items/:variantId` fija la cantidad a mano y `POST /:id/undo` deshace la última lectura vigente (marca `undone_at`; el registro nunca se borra: un trigger lo impide). Cada lectura es una transacción propia: la sesión puede caducar y el conteo se reanuda sin pérdida.
6. **Hallazgos.** `inventory_count_findings` (código, tipo `NOT_FOUND`/`OUT_OF_SCOPE`, cantidad, nota, ronda). Las piezas fuera de alcance se agrupan por SKU. No afectan el stock. El operador puede anotar; quien tiene `inventory-counts:approve` los marca como **regularizados con nota** desde la revisión (también después de aprobar), porque la regularización en sí es manual.
7. **Conciliación (regla de ADR-014).** Cada lectura guarda el **cursor** de la variante: el id del último movimiento del libro en ese instante, tomado con la variante bloqueada (así ningún movimiento queda «entre» la lectura y el cursor). Las variantes sin lecturas se cuentan como 0 al cerrar la ronda, con el cursor de ese momento. Para cada variante:

   ```
   esperado   = saldo vigente − Σ movimientos posteriores al cursor    (lo que el sistema tenía al contar)
   diferencia = conteo final − esperado                                (el ajuste real)
   resultado  = saldo vigente + diferencia = conteo final + Σ posteriores
   ```

   El conteo final es el del recuento si existe, si no el del primer conteo. Así un ingreso confirmado durante el conteo **no** es una diferencia y se conserva, y la diferencia nunca se calcula contra la foto inicial. Es una función pura (`reconcileCount`). La «foto» (`system_qty`, `snapshot_cursor`) se conserva para la revisión.

8. **Segundo recuento.** Al cerrar el primer conteo se marca `needs_recount` en las variantes con `diferencia ≠ 0`. En `RECOUNT` solo esas variantes admiten lecturas (otras se rechazan) y el operador no ve el primer conteo. El recuento tiene su propio cursor; sus lecturas, hallazgos y registro llevan `round = 2`.
9. **Aprobación atómica.** `POST /:id/approve` (permiso `inventory-counts:approve`, Responsable o Administrador): en una transacción bloquea la fila del conteo (`FOR UPDATE`, lo que impide la doble aprobación y serializa aprobar/cancelar), bloquea las variantes en orden, concilia, y genera **un movimiento `COUNT_ADJUSTMENT` por variante con diferencia** mediante `applyStockChanges` (`reference_type = 'INVENTORY_COUNT'`, motivo `Conteo CNT-…`, costo unitario vigente, usuario = quien aprueba). `applyStockChanges` rechaza dejar el saldo negativo: si una sola variante lo dejaría, **todo** se revierte y el conteo sigue en revisión (la revisión lista los bloqueos). Los resultados se congelan en las líneas (esperado, final, movimientos conciliados, diferencia, saldos, costo, movimiento) y se audita.
10. **Costos.** Costo unitario y valor de las diferencias solo con `costs:read`; sin él, `null`.
11. **Permisos.** Se reutilizan `inventory-counts:read|manage|approve`. El Responsable de inventario recibe `approve` (E6 / Q-01 B); el Vendedor no tiene ninguno (Q-15). Autorización en `preValidation` (401/403 antes que 400).
12. **Inmutabilidad en la base.** CHECK de cantidades, de resultado coherente (`balance_after = balance_before + diferencia`, movimiento ⇔ diferencia ≠ 0) y de estados; triggers que impiden borrar conteos y modificar un conteo/líneas terminados (`APPROVED`, `CANCELLED`), y que dejan las lecturas como registro de solo agregar (solo se marca `undone_at`, una vez).

## Alternativas consideradas

- **Comparar contra la foto inicial** (lo más simple): un ingreso durante el conteo se vería como un sobrante falso. ADR-014 lo descarta.
- **Un único cursor al iniciar**: trata como «posteriores» movimientos que sí estaban en el estante cuando se contó la pieza. Se prefiere el instante de la última lectura de cada variante.
- **Bloquear movimientos durante el conteo**: el cliente decidió no hacerlo (P-13).
- **Ocultar la cantidad con `null`**: aun así revelaría la existencia del campo y es fácil filtrarla por error; la vista `BLIND` simplemente no la tiene.
- **Varios operadores simultáneos**: el cliente pidió uno solo; evita lecturas duplicadas.
- **Una lectura por pieza en el recuento sin lista**: se limita a las variantes con diferencia, como pidió el cliente.

## Consecuencias

- La lista de recuento revela inevitablemente qué variantes tuvieron diferencia (es la regla del cliente); no revela cuántas piezas.
- El operador del recuento puede ser el mismo del primer conteo: el cliente no exigió otra persona (queda como punto a confirmar en PENDIENTES).
- Un código desconocido leído en las dos rondas aparece como dos hallazgos (uno por ronda).
- No hay integración con marcas de lectores: el lector es un teclado (texto + Enter).
- Quedan fuera: ubicaciones/estantes (multi-sucursal), conteo cíclico programado y el aviso por diferencias grandes.

## Actualización 2026-11-05: regla de autorización compartida

La regla de autorización compartida del cliente ([RESOLUCIONES-2026-11-05](../business/RESOLUCIONES-2026-11-05.md))
confirma que **el Administrador y el Responsable de inventario aprueban conteos** con
`inventory-counts:approve`; no cambia nada en este ADR. Se hace explícito que quien aprueba puede ser quien
capturó el conteo (sin segregación obligatoria; riesgo aceptado, trazable por auditoría: P-43). Los ajustes
(ADR-017) y los precios (ADR-018) pasaron a seguir la misma regla.

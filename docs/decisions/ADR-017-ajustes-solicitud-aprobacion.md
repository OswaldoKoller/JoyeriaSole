# ADR-017: Ajustes con solicitud y aprobación

- **Estado:** Aceptado (amplía [ADR-009](ADR-009-physical-counts.md); usa el libro de [ADR-007](ADR-007-inventory-ledger.md))
- **Fecha:** 2026-11-05

## Contexto

El cliente definió en la reunión del 2026-11-05 (Q-01 B · subpregunta a, Q-14 A, E1/P-20, B11):

- Los **ajustes manuales** de stock los **solicita** el Responsable de inventario y **solo los aprueba**
  el Administrador, que puede aprobar también los suyos. El stock cambia **únicamente al aprobar**.
- Los motivos son un **catálogo predefinido** (Robo, Pérdida, Muestra, Rotura, Error de registro, Otro)
  **más** texto libre.
- Para **descontinuar** un producto se hace un ajuste de salida a cero y luego se desactiva.
- Nunca puede quedar **stock negativo**.
- El Administrador ve un contador de pendientes en su inicio, sin correo.

Hasta ahora solo existía el stock inicial; el permiso `inventory:adjust` era único.

## Decisión

1. **Documento de ajuste.** `inventory_adjustments` (número legible `AJ-000001`) con estado
   `PENDING → APPROVED | REJECTED | CANCELLED` y líneas `inventory_adjustment_items` (variante,
   diferencia con signo ≠ 0, saldo visto al solicitar). Una solicitud puede tener varias líneas y un
   solo motivo y observación. La observación es obligatoria si el motivo lo exige («Otro»).
2. **Catálogo de motivos.** Tabla `adjustment_reasons` (`code`, `name`, `requires_notes`, `is_active`,
   `sort_order`) sembrada por el seed de forma idempotente (solo agrega los que faltan). El código
   `OTHER` exige observación.
3. **Permisos separados.** `inventory:adjust` = solicitar, consultar y cancelar lo propio (Administrador
   y Responsable). `inventory:adjust-approve` = aprobar o rechazar (**solo Administrador**) y ver el
   contador de pendientes. El Vendedor no tiene ninguno y no ve nada de ajustes.
4. **El stock solo cambia al aprobar.** Solicitar, rechazar y cancelar no escriben en
   `inventory_movements` ni `inventory_balances`.
5. **Aprobación atómica y revalidada.** En una sola transacción: se bloquea la fila del documento
   (`FOR UPDATE`; serializa aprobaciones, rechazos y cancelaciones simultáneas); se **revalida cada
   línea con el saldo vigente** (el stock pudo cambiar entre la solicitud y la aprobación); se aplica un
   movimiento `ADJUSTMENT` por línea mediante la operación genérica `applyStockChanges`; se registran en
   cada línea la **cantidad anterior y nueva**, el costo unitario vigente y el id del movimiento; se
   cierra el documento y se audita. Si **cualquier** línea dejara el saldo negativo, se lanza
   `BusinessRuleError` (422) y todo se revierte: el ajuste sigue pendiente.
6. **Validación al solicitar.** La API rechaza (422) una línea que ya hoy dejaría el saldo negativo,
   variantes inactivas y motivos inactivos. La validación definitiva es la de la aprobación.
7. **Operación genérica de stock.** `modules/inventory/stock-ledger.ts` expone `applyStockChanges(tx, cambios)`:
   bloquea las variantes y sus saldos **en orden de id** (el mismo orden de ingresos y stock inicial,
   para no interbloquearse), valida saldo ≥ 0 y ≤ máximo, inserta el movimiento y actualiza el saldo en
   la transacción del llamador. La lógica pura (`planBalanceChange`) está probada aparte. Es la base
   reutilizable para los conteos (ADR-014) y los cambios (Q-12).
8. **Trazabilidad.** El movimiento lleva `reference_type = 'INVENTORY_ADJUSTMENT'`, `reference_id` = id del
   documento, motivo `Ajuste AJ-… · <motivo>`, observación, costo unitario y como usuario a **quien
   aprueba**; el documento conserva quién solicitó, cuándo, quién resolvió y el comentario. La auditoría
   (`inventory_adjustment.requested|approved|rejected|cancelled`) se graba en la misma transacción.
9. **Rechazo y cancelación.** Rechazar exige un comentario. Solo quien solicitó puede cancelar y solo
   mientras esté pendiente; el Administrador, si no quiere el ajuste, lo rechaza.
10. **Inmutabilidad en la base de datos.** CHECK (`quantity_delta <> 0`; cantidad nueva = anterior +
    diferencia y ≥ 0; resolución consistente con el estado; rechazo con comentario) y triggers que
    impiden borrar ajustes y modificar uno ya resuelto o sus líneas.
11. **Costos.** Costo unitario y valor de cada línea (y del documento) solo se devuelven con `costs:read`;
    sin ese permiso la API envía `null`.
12. **Atajo «Ajustar a cero».** Desde Inventario abre la solicitud con la salida de todo el saldo actual.
    No desactiva nada: la desactivación con stock > 0 la regula P-22 en otra rebanada. Si el saldo cambia
    entre la solicitud y la aprobación, aplica la regla 5 (si ya no alcanza, no se aprueba).

## Alternativas consideradas

- **Ajuste directo con auditoría** (un solo paso): contradice Q-01 B; no hay segregación de funciones.
- **Una solicitud por variante**: más simple, pero el cliente ajusta varias piezas por el mismo motivo
  (p. ej. un robo) y necesita aprobarlas juntas.
- **Guardar la cantidad nueva en lugar de la diferencia**: se descuadra si el stock cambia antes de
  aprobar; la diferencia es el dato estable y la cantidad nueva se calcula al aprobar.
- **Umbral de aprobación automática** (E1 con cifras): el cliente no dio cifras ni canal; no se implementa.
- **CHECK `quantity >= 0` en `inventory_balances`**: el control vive en el servicio (P-08). Se evita
  tocar la tabla compartida con otras rebanadas.

## Consecuencias

- La bandeja global «Pendientes de aprobación» (Q-14) consume `GET /inventory/adjustments/pending-count`;
  esta rebanada incluye una sección propia en `/inventario/ajustes`.
- El Responsable, al tener `inventory:adjust`, también puede registrar el **stock inicial** (única vez
  por variante), porque ese endpoint comparte el permiso. Si el cliente quiere que el stock inicial pase
  también por aprobación, se separa su permiso o se convierte en un ajuste (pendiente de confirmar).
- Los ajustes aprobados no se corrigen: se compensan con otro ajuste.
- Quedan sin definir el aviso por ajustes grandes (E1, sin cifras) y el límite de piezas por línea
  (1 000 000 por defecto, técnico).

## Actualización 2026-11-05: regla de autorización compartida

El cliente fijó, después de Q-01 B y para evitar bloqueos, que **tanto el Administrador como el Responsable
de inventario pueden autorizar** ([RESOLUCIONES-2026-11-05](../business/RESOLUCIONES-2026-11-05.md), regla
de autorización compartida). Efecto sobre este ADR (el texto anterior no se reescribe):

- `inventory:adjust-approve` ya **no** es «solo Administrador»: lo tienen también el Responsable de inventario
  y el Administrador. El Responsable puede aprobar y rechazar ajustes, incluidos los suyos; no hay
  segregación obligatoria (riesgo aceptado, trazable por auditoría: P-43).
- El flujo **solicitar → aprobar** sigue vigente para roles que tengan solo `inventory:adjust` (p. ej. roles
  personalizados): solicitan y otra persona con `inventory:adjust-approve` decide.
- `inventory:initial-stock` (stock inicial, P-40) también es del Administrador y del Responsable; la
  consecuencia sobre el stock inicial descrita arriba queda resuelta por esta regla.
- Sigue siendo exclusivo del Administrador: auditoría, usuarios/roles, borrado físico y configuración.

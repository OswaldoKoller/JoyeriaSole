# 06 · Roadmap actualizado de Fase 2 «Ventas» (E0 a E7 y Fase 3)

Paquete de análisis para revisión · Documento 6 de 8 · Fecha de corte: 2026-11-09 · Reemplaza, **solo como propuesta**, la sección 5.2 y 6.1 de `docs/informe-tecnico/06-estado-deuda-y-fase-2.md` (no se edita ese archivo).

**Autorización vigente: SOLO ANÁLISIS Y DOCUMENTOS PARA REVISIÓN.** Ninguna etapa de este documento está autorizada para implementarse. `CLAUDE.md` prohíbe hoy el punto de venta y la implementación de módulos sin aprobación explícita; la autorización posterior debe ser «expresa y delimitada» (resolución §9).

Etiquetas: **[CONFIRMADA]** (lo dijo el responsable), **[RECOMENDACIÓN TÉCNICA]** (mía), **[PENDIENTE]** (requiere decisión). Las estimaciones son orientativas, en jornadas efectivas con pruebas, documentación y revisión (misma definición que `06` §1), y **no son compromisos**.

## 1. Restricción explícita para agentes

> **E2 EXCLUIDA: no implementar anulaciones ni mecanismos equivalentes.** [CONFIRMADA — DEC-V07, resolución §2 y §5]
>
> Esto incluye: `POST /sales/:id/void`; permiso `sales:void`; movimiento `SALE_VOID`; estado `VOIDED`; botones de anulación; eliminación física de ventas confirmadas; modificación de importes o productos de una venta confirmada; y **cualquier mecanismo de reversión encubierto** (por ejemplo, usar un ajuste de inventario, un cambio de pieza inverso, un pago negativo, una «nota de crédito» o un campo de «cancelada» para deshacer una venta). Si una tarea parece requerirlo: **detenerse, documentarlo como incidencia y presentarlo al responsable** (`08`, SD-A01 a SD-A08).

Esta restricción se copia a cada etapa que pudiera tocarla (E1, E3, E4, E5).

## 2. Resumen de etapas

| Etapa      | Nombre (resolución §5)                           | Estado de decisión                                                                                                    | Estimación orientativa revisada                                                                | Depende de                                                                                        |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **E0**     | Estabilización previa                            | [CONFIRMADA] como etapa (unificar libro, idempotencia, concurrencia, integridad, recuperación)                        | **8 a 13** (06: 7 a 11, +1 a 2 por pruebas de recuperación explícitas, ajuste mío)             | Autorización; OD-01…OD-03                                                                         |
| **E1**     | Venta de mostrador                               | [CONFIRMADA] el alcance (venta atómica, pagos mixtos, código de barras, comprobante interno)                          | **9 a 14** (06: 8 a 12, +1 a 2 por DEC-V12: 4 formatos, vista previa, reimpresión; ajuste mío) | E0; Q-V01…Q-V05 (confirmadas); ADR-023/024/027/029 propuestos; **conflicto de orden con E3 (§3)** |
| **E2**     | Anulaciones                                      | **EXCLUIDA** [CONFIRMADA]                                                                                             | **0** (06 tenía 2 a 4)                                                                         | —                                                                                                 |
| **E3**     | Caja y arqueo                                    | [CONFIRMADA] alcance principal; **condicionada**: se hace DESPUÉS de cerrar las 8 subdecisiones                       | **5 a 8 (condicionada)**; sin firmeza hasta cerrar subdecisiones (06: 4 a 6)                   | E1; subdecisiones SD-C01…SD-C08; ADR-028 propuesto                                                |
| **E4**     | Cambios de piezas                                | **[PENDIENTE]** de definición; no confundir con anulación                                                             | **Sin estimación firme** (referencia histórica 06: 4 a 6, no vigente)                          | E1, E3; Q-V08; DEC-V07                                                                            |
| **E5**     | Reportes                                         | **[PENDIENTE]** de confirmación funcional                                                                             | **Sin estimación firme** (referencia histórica 06: 4 a 6)                                      | E1; Q-V15; G1…G6                                                                                  |
| **E6**     | Mejoras adicionales                              | Fuera del MVP salvo aprobación específica [CONFIRMADA]                                                                | Referencia 3 a 5 c/u; apartados excluidos por Q-V05                                            | Aprobación específica                                                                             |
| **E7**     | Piloto y aceptación                              | [CONFIRMADA] como etapa                                                                                               | Calendario del cliente                                                                         | E1…E3 (y las que se definan)                                                                      |
| **Fase 3** | (06 la llama «Facturación con adaptador al SIN») | **[PENDIENTE] redefinir**: la resolución §5 no la lista; Q-V02 [CONFIRMADA] deja la facturación en un sistema externo | **No estimar**                                                                                 | Decisión del responsable (matriz C-10)                                                            |

### 2.1 Totales revisados

| Concepto                                             |    Jornadas | Nota                                             |
| ---------------------------------------------------- | ----------: | ------------------------------------------------ |
| E0                                                   |      8 a 13 | [RECOMENDACIÓN TÉCNICA]                          |
| Redacción de ADR (022, 023, 024, 027, 028, 029, 030) |       2 a 3 | Igual que 06 (ADR-025 ya no se redacta)          |
| E1                                                   |      9 a 14 |                                                  |
| E3                                                   |       5 a 8 | Condicionada                                     |
| **Núcleo confirmado (E0 + ADR + E1 + E3)**           | **24 a 38** | Antes: 31 a 48 con E2, E4 y E5                   |
| E4 y E5, si se definen como en 06                    |    +8 a +12 | Solo referencia; **no vigente** hasta definirlos |
| **Máximo si E4 y E5 se aprueban como en 06**         |     32 a 50 |                                                  |

Además, antes de operar con dinero real `06` identifica trabajos de producción que condicionan el piloto (2FA OD-08, copias OD-09, tanda 3): se mantienen como [RECOMENDACIÓN TÉCNICA] y **no** están incluidos en estas sumas. Q-V01…Q-V05 confirmadas no eliminan las esperas del cliente (hosting, usuarios, datos), que no se estiman.

## 3. CONFLICTO DE ORDEN: E1 antes de E3 frente a DEC-V09

### 3.1 Los hechos

| #   | Hecho                                                                                                                                                                                 | Etiqueta / fuente          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | La resolución ordena E1 (venta de mostrador) antes de E3 (caja y arqueo), y E3 «DESPUÉS de cerrar las subdecisiones».                                                                 | [CONFIRMADA] resolución §5 |
| 2   | DEC-V09: caja única con apertura, **registro de cobros**, cierre y arqueo.                                                                                                            | [CONFIRMADA] resolución §3 |
| 3   | «Las ventas deben asociarse con la sesión de caja correspondiente». Está en el modelo técnico **propuesto**, no en la regla confirmada.                                               | Resolución §3 (propuesta)  |
| 4   | **Subdecisión 2: «venta sin sesión abierta» está PENDIENTE.**                                                                                                                         | [PENDIENTE] resolución §3  |
| 5   | La propuesta previa ya preveía `sales.cash_session_id` «nullable hasta E3».                                                                                                           | `06` §5.4 línea 738        |
| 6   | El propio informe 06 decía: «Criterio mínimo para operar con dinero real: E1 a E3 completas. Vender sin cierre de caja convierte el sistema en un registro sin control del efectivo». | `06` línea 689             |
| 7   | Una venta confirmada no se puede modificar en importes ni productos ni anular.                                                                                                        | [CONFIRMADA] DEC-V07       |

Lectura exacta: el conflicto no es una contradicción literal entre dos reglas confirmadas, sino una **tensión**: lo confirmado es la caja y su finalidad (control de cobros); el vínculo obligatorio venta-sesión está en el modelo propuesto y la posibilidad de vender sin sesión está pendiente. Aun así, si E1 sale a producción sin E3, las ventas de E1 **no tendrán sesión** y no habrá cómo conciliarlas después.

### 3.2 Qué pasa con las ventas de E1 sin caja (`cash_session_id` nulo)

| Efecto                                                     | Explicación                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El efectivo cobrado no entra en ningún arqueo              | El esperado de una sesión = fondo + cobros en efectivo **de sus ventas**; las ventas sin sesión no suman en ninguna.                                                                                                                                                                                                   |
| No se puede reconstruir la conciliación                    | Faltan fondo inicial y efectivo contado de ese período. Asignar ventas a una «sesión histórica» por rango de fechas crearía un esperado sin contado real: la diferencia no sería verificable.                                                                                                                          |
| No se pueden corregir después                              | Rellenar `cash_session_id` en ventas ya confirmadas es modificar la venta. DEC-V07 prohíbe modificar importes y productos; el vínculo no es un importe, pero un trigger de inmutabilidad total (lo recomendado para ventas) lo impediría, y permitir una excepción abre un hueco de auditoría. [RECOMENDACIÓN TÉCNICA] |
| No hay anulación como salida                               | Una venta registrada en el período sin caja no puede deshacerse; solo existiría un proceso excepcional aprobado (`08`, SD-A01).                                                                                                                                                                                        |
| Cobros QR y transferencia                                  | Quedan sin ninguna sesión contra la cual conciliar (SD-C07).                                                                                                                                                                                                                                                           |
| La migración posterior se complica                         | Si E3 agrega `NOT NULL`, hace falta backfill imposible de hacer con rigor; si se deja nullable, el hueco es permanente y todo reporte debe tratar «sin sesión» como categoría.                                                                                                                                         |
| Las pruebas de E1 en producción son reales e irreversibles | Una venta de prueba en producción descuenta stock real. Sin anulación solo se deshace con un ajuste aprobado, que es justamente lo que SD-A07 pregunta si es admisible. Las pruebas de E1 deben hacerse en la BD de pruebas o en un entorno aparte.                                                                    |
| E7 pide «conciliación de caja»                             | Las ventas de E1 sin caja no entran en esa conciliación.                                                                                                                                                                                                                                                               |

### 3.3 Alternativas para decisión (no elijo por el responsable)

|                                     | A. Liberar E1 + E3 juntas                                                                                                                                       | B. E1 exige sesión abierta                                                                                                                                                                                                                          | C. Modo piloto                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idea                                | E1 y E3 se pueden desarrollar en orden, pero **se habilitan a los usuarios reales en un solo lanzamiento**. Hasta entonces E1 solo corre en entornos de prueba. | E1 incluye desde el inicio el **núcleo mínimo** de sesión de caja (abrir/cerrar, una sesión abierta); la venta es imposible sin sesión.                                                                                                             | E1 se habilita antes que E3 en un modo marcado como piloto, con ventas «sin caja» identificadas y operación paralela con el método actual.                                                                  |
| Qué ocurre con `cash_session_id`    | Nullable solo durante el desarrollo; todas las ventas reales ya nacen con sesión.                                                                               | `NOT NULL` desde el día 1 para ventas reales.                                                                                                                                                                                                       | Nullable; ventas piloto con marca explícita (por ejemplo, un indicador) y reportadas aparte.                                                                                                                |
| Ventajas                            | Cero ventas reales sin conciliación; respeta «E3 después de las subdecisiones» si el lanzamiento espera a E3; mantiene E1 y E3 como etapas separadas.           | Integridad desde el primer día; no hay ventas huérfanas.                                                                                                                                                                                            | Permite validar el flujo de venta con operadores antes de resolver caja; encaja con E7 (operaciones reales supervisadas).                                                                                   |
| Desventajas                         | Retrasa el valor visible de E1 hasta cerrar las 8 subdecisiones.                                                                                                | Obliga a decidir **antes de E1** al menos las subdecisiones 1 (roles) y 3 (fondo inicial), y quizá 8; **adelanta parte de E3** y contradice «E3 DESPUÉS de cerrar las subdecisiones» salvo que ese núcleo se limite a lo ya confirmado. Aumenta E1. | Crea ventas reales (stock real descontado, irreversibles) sin sesión: el hueco de §3.2 existe. Mezcla datos piloto con producción. Requiere una regla de qué se hace con esas ventas al llegar E3 (SD-C02). |
| Riesgo residual                     | El cliente puede presionar para usar E1 antes.                                                                                                                  | Si las subdecisiones se responden mal, se rehace la apertura.                                                                                                                                                                                       | Alto en integridad contable y de efectivo.                                                                                                                                                                  |
| Subdecisión que presupone           | SD-C02 = «no se permite vender sin sesión» (en producción)                                                                                                      | SD-C02 = «no se permite vender sin sesión», más SD-C01 y SD-C03 resueltas antes                                                                                                                                                                     | SD-C02 = «se permite temporalmente», con regla de cierre del piloto                                                                                                                                         |
| Cambio en el orden de la resolución | Ninguno en el desarrollo; cambia el momento de habilitar                                                                                                        | Parte de E3 pasa a E1                                                                                                                                                                                                                               | Ninguno                                                                                                                                                                                                     |

**Preguntas que el responsable debe contestar para decidir:** (1) ¿Se venderá con dinero real antes de tener caja? (2) ¿Puede la operación paralela con el método actual cubrir el período sin caja en el sistema? (3) ¿Se acepta que las ventas de ese período queden fuera del arqueo para siempre? (4) ¿Quiénes abren y cierran la caja (SD-C01) y con qué fondo (SD-C03)? Esa respuesta es **independiente** de la alternativa elegida y se necesita en todos los casos.

[RECOMENDACIÓN TÉCNICA] válida para cualquiera de las tres: (a) no permitir ventas reales con `cash_session_id` nulo sin una decisión escrita; (b) hacer las pruebas de E1 en la BD de pruebas; (c) la decisión debe registrarse como resolución y reflejarse en ADR-028 antes de escribir la migración de `sales` (documento `03`).

## 4. Detalle por etapa

### E0 · Estabilización previa

Objetivo [CONFIRMADA]: unificar operaciones del libro de inventario, validar idempotencia, concurrencia, integridad y recuperación. Propósito [RECOMENDACIÓN TÉCNICA]: que `sales` no sea el cuarto escritor del libro.

| Frente                           | Contenido [RECOMENDACIÓN TÉCNICA]                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidencia actual                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| E0.1 Unificar el libro           | Migrar `stock-entries.confirm`, `initialStock` y `products.remove` a la operación única `applyStockChanges` (o `dropEmptyBalances` para el borrado de saldos vacíos). Extenderla con opciones (`unitCost`, `referenceType`, `referenceId`). Conservar las pruebas de concurrencia y los mutantes de ingresos.                                                                                                                                                                              | `stock-entries.service.ts:752-780`; `inventory.service.ts:179-190`; `products.service.ts:665` (verificados hoy); DT-ARQ-01/02 |
| E0.2 Fachada y guarda            | `modules/inventory/index.ts` como única entrada; regla ESLint (`no-restricted-syntax`) o prueba estática que falle si `inventoryMovement.create` o `inventoryBalance.*` aparece fuera del módulo; verificar con un cambio de prueba que debe romperla.                                                                                                                                                                                                                                     | DT-ARQ-03 (`inventory-counts` y `exchanges` importan `stock-ledger.ts` interno)                                               |
| E0.3 Estado activo y bloqueos    | `requireActive` en el ledger bajo bloqueo; orden de bloqueo único documento → variantes por id → saldo; `FOR NO KEY UPDATE` sobre variantes donde no cambie la clave; corregir el orden inverso de `products.remove`.                                                                                                                                                                                                                                                                      | `stock-ledger.ts:80,89` solo bloquea y no valida estado; DT-ARQ-04/05                                                         |
| E0.4 Idempotencia                | Patrón único `client_request_id` + `request_hash` con `INSERT … ON CONFLICT` y respuesta idéntica en reintento (200 con `Idempotent-Replay`), hash distinto → 409. Para documentos ya existentes, el cinturón en el libro (índice único parcial `(reference_type, reference_id, variant_id)`, I-02) hasta que se demuestre un problema real. Se aplica **a ventas** en E1.                                                                                                                 | DT-ARQ-06; OD-03; `DATABASE.md:213,254-259` (I-02 propuesta, no aplicada)                                                     |
| E0.5 Verificación del libro      | Prueba de propiedad y script `db:verify-ledger` (ninguno existe hoy). Invariantes: (i) `balances.quantity` = Σ `movements.quantity` por variante; (ii) = `balance_after` del último movimiento; (iii) encadenamiento: cada `balance_before` = `balance_after` del movimiento anterior de esa variante; (iv) `balance_after = balance_before + quantity`; (v) `quantity >= 0`; (vi) sin movimientos huérfanos de saldo ni saldos sin movimientos. El script devuelve 0 filas ⇔ consistente. | V-10 de la matriz; DT-DAT-01                                                                                                  |
| E0.6 Concurrencia                | Dos operaciones sobre la última unidad (una 201, otra 422); desactivar vs confirmar; borrar producto vs confirmar ingreso (sin deadlock); ajuste aprobado vs ingreso; N operaciones paralelas en variantes distintas; N sobre la misma variante con stock M (exactamente M éxitos); doble POST del mismo documento. **Mutantes**: las pruebas deben fallar si se quitan los bloqueos.                                                                                                      | DT-TST-01/02                                                                                                                  |
| E0.7 Recuperación                | (1) Restaurar un `pg_dump` en una base vacía y ejecutar `db:verify-ledger`; (2) transacción abortada a mitad (error inyectado tras el movimiento, antes del commit): no queda ni movimiento ni saldo ni auditoría; (3) reintento tras 503 (`Retry-After`) con el mismo identificador de solicitud no duplica; (4) reinicio de la API durante una operación: el estado es consistente al volver.                                                                                            | OD-09; DT-OPS-02; `BACKUPS.md`                                                                                                |
| E0.8 Garantías de BD             | Por fases (OD-01 B): I-02, I-05, I-04 primero; I-01 (trigger diferido) tras migrar el libro y con la reconciliación previa. **Con DEC-V07, el CHECK de signo (I-05) no incluye `SALE_VOID`: `SALE` < 0, sin tipo de anulación.**                                                                                                                                                                                                                                                           | `DATABASE.md:206-267`; matriz C-03                                                                                            |
| E0.9 Pruebas aisladas y permisos | E2E con datos propios por spec (DT-TST-03); seed idempotente de estructura en el despliegue (DT-OPS-04).                                                                                                                                                                                                                                                                                                                                                                                   | `06` §3.4                                                                                                                     |
| E0.10 Documentación              | Barrido DT-DOC-01/02/09; registrar la resolución y las P-V (matriz A-01/A-02); ADR-022 (fachada). `CLAUDE.md` solo lo edita el responsable.                                                                                                                                                                                                                                                                                                                                                | `06` §3.4.6                                                                                                                   |

**Dependencia declarada:** `fast-check` no está declarado en ningún `package.json` (solo transitivo en `package-lock.json`); usarlo exige declararlo y justificarlo (CLAUDE.md). [RECOMENDACIÓN TÉCNICA]: la prueba de propiedad puede escribirse con generación de casos propia si se prefiere no agregar la dependencia; decisión del responsable.

**Puerta de calidad E0** (evidencia objetiva): `db:verify-ledger` ejecutable y prueba de propiedad verde con concurrencia; guarda automática probada; 0 escrituras al libro fuera de `modules/inventory`; `requireActive` probado; mutantes de bloqueo fallan; prueba de recuperación (restauración + verificación) documentada; CI remoto verde; ADR-022 aceptado; documentos coherentes. **Fuera de E0:** cualquier tabla, endpoint o permiso de ventas.

### E1 · Venta de mostrador

**Alcance [CONFIRMADA]:** venta atómica, pagos mixtos (efectivo, QR, transferencia, solo Bs), consulta por código de barras, comprobante interno imprimible. Solo ventas pagadas íntegramente al momento (Q-V05).

**Propuesto [RECOMENDACIÓN TÉCNICA]:** `sales`, `sale_items` (con snapshots de precio, costo y descripción), `sale_payments`, `payment_methods`; `POST /sales` idempotente; `GET /sales/lookup?code=` propio (permiso de ventas, sin costos); pantalla `/ventas/nueva` con lector tipo teclado; carrito persistido en `sessionStorage` (sesión fija de 8 h, DT-13); revisión previa al cobro con productos, cantidades y precios definitivos; ventas totalmente inmutables.

**Fuera de alcance de E1:** anulaciones y equivalentes (§1); descuentos (Q-V06 pendiente); clientes (Q-V10); apartados y crédito (excluidos); facturación; cambios de pieza (E4); caja (E3, ver §3).

**Dependencias:** E0; el conflicto de orden del §3 resuelto; subdecisiones de numeración y comprobante necesarias para el correlativo (SD-R01…SD-R03 en `08`); ADR-023/024/027/029 propuestos aceptados.

**Puerta de calidad E1:**

| Verificación        | Detalle                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atomicidad          | Un fallo en cualquier línea revierte venta, líneas, pagos, movimientos y auditoría                                                                                                                   |
| Doble envío         | Una sola venta; el reintento devuelve la misma                                                                                                                                                       |
| Concurrencia        | Última unidad; venta vs ajuste aprobado, vs cambio de precio, vs ingreso, vs desactivar variante, vs conteo; mutantes                                                                                |
| Totales             | Centavos enteros; Σ líneas = total; Σ pagos = total; efectivo recibido ≥ importe y vuelto correcto                                                                                                   |
| Comprobante         | Se genera desde datos persistidos (no recalcula); importes del comprobante = importes de la venta; imprimir no crea venta; reimprimir no modifica importes; un fallo de impresión no altera la venta |
| Restricción DEC-V07 | Prueba que falle si existe `sales:void`, `SALE_VOID`, un estado `VOIDED`, una ruta `void`, un `DELETE` o `PATCH` de importes; triggers de inmutabilidad probados                                     |
| Seguridad           | Vendedor sin costos en ninguna respuesta; 401/403/400/caso feliz; IDOR en ventas ajenas según lo que se decida (Q-V13)                                                                               |
| E2E                 | Flujo con lector simulado y **datos propios por spec**                                                                                                                                               |
| Operación           | 2FA y copias operativas (OD-08, OD-09) antes de dinero real [RECOMENDACIÓN TÉCNICA, de `06`]                                                                                                         |

### E2 · Anulaciones — EXCLUIDA

[CONFIRMADA] Excluida del desarrollo autorizado. Sin alcance, sin estimación, sin puerta. Ver §1. Lo que `06` ponía aquí (estado `VOIDED`, `SALE_VOID`, `sales:void`, pagos de signo contrario, reporte de anulaciones) queda **no aprobado**; su trazabilidad está en la matriz, §1.2.

### E3 · Caja y arqueo

**Alcance [CONFIRMADA]:** caja única con apertura, cierre, asociación de pagos y cálculo del arqueo, **después de cerrar las subdecisiones** (SD-C01…SD-C08).

**Propuesto [RECOMENDACIÓN TÉCNICA]:** `cash_sessions` y `cash_movements` (append-only), índice único parcial de sesión abierta, esperado calculado y congelado al cierre, cierre idempotente, cobros QR y transferencia reportados aparte del efectivo, diferencia registrada, sesión cerrada inmodificable; ADR-028.

**Dependencias:** E1; las 8 subdecisiones; decisión del §3.

**Puerta de calidad E3:**

| Verificación                     | Detalle                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una sola sesión abierta          | Índice parcial en BD; dos aperturas simultáneas: una falla                                                                                                      |
| Cierre idempotente y concurrente | Dos cierres a la vez: uno cierra, el otro recibe la misma respuesta o error claro; un cierre repetido no cambia datos                                           |
| Venta durante el cierre          | Serialización: la venta toma la sesión con bloqueo compartido y el cierre con bloqueo exclusivo; una venta no puede entrar en una sesión ya cerrada ni perderse |
| Esperado                         | Recalculado = congelado; no editable directamente                                                                                                               |
| Separación por medio             | Efectivo, QR, transferencia y pagos mixtos se reportan por separado                                                                                             |
| Arqueo ensayado                  | Con una diferencia conocida                                                                                                                                     |
| Inmutabilidad                    | Sesión cerrada no se modifica                                                                                                                                   |

### E4 · Cambios de piezas

[PENDIENTE] de definición; no es una anulación. Existe la base técnica de ADR-019 (`POST /inventory/exchanges`, `EXCHANGE_IN`/`EXCHANGE_OUT`). Sin alcance aprobado. Hay que decidir antes: quién los registra (P-30), qué pasa con la diferencia de precio y de dinero, si se cambia la misma pieza (ADR-019 exige variantes distintas), ventas anteriores al sistema, revisión de la pieza devuelta, y cómo se corrige un cambio erróneo sin reversión encubierta (SD-X01…SD-X07 en `08`). **Restricción:** E4 no puede usarse como vía para anular ventas (§1). Dependencia: E1 y E3 (la diferencia en efectivo necesita sesión).

### E5 · Reportes

[PENDIENTE] de confirmación funcional (Q-V15, G1…G6 sin respuesta). Referencia técnica no vigente: reportes de solo lectura, día en `America/La_Paz`, CSV con escape de fórmulas. Se retiran los reportes de «anuladas». Las exportaciones de ventas deben respetar `costs:read`.

### E6 · Mejoras adicionales

Fuera del MVP salvo aprobación específica [CONFIRMADA]. Apartados y crédito están excluidos por Q-V05. Quedan clientes (Q-V10) y descuentos (Q-V06), cada uno con su ADR antes del código.

### E7 · Piloto y aceptación

[CONFIRMADA]: pruebas con operaciones reales supervisadas, conciliación de caja, inventario y comprobantes. [RECOMENDACIÓN TÉCNICA] para las puertas: acta del cliente; ensayo de arqueo con diferencia conocida; conteo físico de verificación sin diferencias materiales; comprobantes impresos coinciden con las ventas; `db:verify-ledger` en verde antes y después; manual por rol y guía de contingencia en papel.

### Fase 3

La resolución §5 no la lista. `06` la define como `invoicing` aislado con adaptador al SIN. Q-V02 [CONFIRMADA] dice que la facturación fiscal será por sistema externo. [PENDIENTE] qué significa Fase 3 ahora. No planificar.

## 5. Dependencias

```
Autorización expresa y delimitada del responsable + actualización de CLAUDE.md
        │
        ▼
E0 ─► ADR 022 (fachada) ─► E1 ◄── decisión de orden (§3: A / B / C)
                              │        ▲
                              │        └── SD-C02 (venta sin sesión) y SD-R01..R03 (numeración)
                              ▼
        8 subdecisiones de caja ─► E3 ─► E4 (si se define)
                              │
                              └────────► E5 (si se confirma)
E2: EXCLUIDA
E6: solo con aprobación específica
E7: tras E1 + E3
Fase 3: [PENDIENTE] redefinir
```

## 6. Trazabilidad con el roadmap anterior

| Antes (`06` §5.2)                           | Ahora                                   | Motivo                                                 |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| E2 Anulación controlada (2 a 4)             | Excluida                                | DEC-V07                                                |
| E3 antes de E4                              | Se mantiene                             | DEC-V09                                                |
| E3 estimada 4 a 6                           | 5 a 8 condicionada                      | Cierre idempotente y concurrente, separación por medio |
| E4 con diferencias de precio como propuesta | Pendiente de definición                 | Resolución §5                                          |
| E6 con apartados                            | Sin apartados                           | Q-V05                                                  |
| Fase 3 SIN                                  | Pendiente de redefinir                  | Q-V02                                                  |
| Núcleo 31 a 48                              | Confirmado 24 a 38 (+8 a 12 si E4 y E5) | §2.1                                                   |

## 7. Cómo se aprobará cada etapa

Ver `README.md`: autorización expresa y delimitada por etapa; ADR antes del código; PENDIENTES actualizado; `npm run check` y `npm run qa` como puertas.

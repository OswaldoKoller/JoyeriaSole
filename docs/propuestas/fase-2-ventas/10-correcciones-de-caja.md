# 10 · Corrección de errores de cierre de caja (solo Administrador)

> **Estado:** documento de análisis y diseño para revisión. **No autoriza** código, migraciones,
> endpoints, permisos ni pantallas. Todo nombre de tabla, columna, permiso, ruta o código de error es
> una **PROPUESTA**; el SQL es ilustrativo.
> **Fecha:** 2026-11-09. **Origen:** aclaración del responsable sobre B6 y B7
> ([RESOLUCIONES-2026-11-09, «Aclaraciones posteriores»](../../business/RESOLUCIONES-2026-11-09.md#aclaraciones-posteriores-2026-11-09)).
> **Relación:** complementa [02](02-diseno-funcional-caja.md) (diseño funcional de la caja) y
> [03](03-modelo-de-datos-ventas-y-caja.md) (modelo de datos); respeta DEC-V07 y DEC-V09
> ([RESOLUCIONES-2026-11-07](../../business/RESOLUCIONES-2026-11-07.md)).

## Cómo leer las etiquetas

| Etiqueta                     | Significado                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **[CONFIRMADA]**             | Decisión escrita del responsable o hecho verificado en el repositorio        |
| **[RECOMENDACIÓN TÉCNICA]**  | Propuesta del análisis; no es regla                                          |
| **[RECOMENDACIÓN DELEGADA]** | Propuesta adoptada porque el responsable pidió «haz lo que sea recomendable» |
| **[PENDIENTE]**              | Subdecisión sin respuesta; se muestran opciones y no se elige                |

## Índice

1. [Punto de partida](#1-punto-de-partida)
2. [Qué es un error de cierre y qué no](#2-qué-es-un-error-de-cierre-y-qué-no)
3. [Opciones evaluadas](#3-opciones-evaluadas)
4. [Opción recomendada](#4-opción-recomendada)
5. [Modelo de datos esquemático](#5-modelo-de-datos-esquemático)
6. [Permiso y quién corrige](#6-permiso-y-quién-corrige)
7. [Contrato propuesto de API y pantallas](#7-contrato-propuesto-de-api-y-pantallas)
8. [Auditoría](#8-auditoría)
9. [Efecto sobre el arqueo y los reportes](#9-efecto-sobre-el-arqueo-y-los-reportes)
10. [Concurrencia e idempotencia](#10-concurrencia-e-idempotencia)
11. [Controles contra la anulación encubierta](#11-controles-contra-la-anulación-encubierta)
12. [Pruebas necesarias](#12-pruebas-necesarias)
13. [Riesgos](#13-riesgos)
14. [Subdecisiones que siguen abiertas](#14-subdecisiones-que-siguen-abiertas)
15. [Impacto en otros documentos](#15-impacto-en-otros-documentos)

---

## 1. Punto de partida

| Hecho                                                                                                      | Etiqueta                       | Fuente                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| No se registran gastos ni retiros de caja en el MVP (sin `cash_movements`)                                 | **[CONFIRMADA]**               | B6                                   |
| Una caja cerrada no se reabre                                                                              | **[CONFIRMADA]**               | B7                                   |
| Hacía falta una vía de corrección; la elige la recomendación técnica                                       | **[CONFIRMADA]** la delegación | Aclaración B6 y B7                   |
| **Solo el Administrador** puede hacer las correcciones                                                     | **[CONFIRMADA]**               | Aclaración B6 y B7                   |
| Fondo inicial obligatorio, digitado en un campo libre en cada apertura                                     | **[CONFIRMADA]**               | B4 y su aclaración                   |
| Toda diferencia se registra con observación obligatoria, sin tolerancia automática                         | **[CONFIRMADA]**               | B5                                   |
| Los datos del cierre se mantienen como información histórica; el esperado no se modifica directamente      | **[CONFIRMADA]**               | DEC-V09, restricciones               |
| No se modifican importes ni productos de una venta confirmada; no hay mecanismos alternativos de reversión | **[CONFIRMADA]**               | DEC-V07                              |
| Una venta errónea se trata como incidencia fuera del sistema, sin ajuste ni documento compensatorio        | **[CONFIRMADA]**               | C5                                   |
| El rol Administrador recibe `ALL_PERMISSIONS`; el Responsable y el Vendedor reciben listas explícitas      | **[CONFIRMADA]** (código)      | `packages/shared/src/permissions.ts` |
| El seed solo **agrega** permisos faltantes a cada rol (`createMany` con `skipDuplicates`); nunca los quita | **[CONFIRMADA]** (código)      | `apps/api/prisma/seed.ts:91-99`      |

Con B6 y B7 juntos, el efectivo esperado de una sesión es `fondo inicial + cobros en efectivo` y la
sesión cerrada es inmutable (`cash_sessions_guard` en el documento 03 §7.5). Un dato mal digitado al
abrir o al cerrar quedaría para siempre sin otra explicación que la observación del cierre. Este
documento diseña la vía que el responsable pidió.

---

## 2. Qué es un error de cierre y qué no

| Caso                                                                                   | ¿Se corrige por esta vía? | Motivo                                                                                         |
| -------------------------------------------------------------------------------------- | :-----------------------: | ---------------------------------------------------------------------------------------------- |
| Efectivo contado mal digitado (1.250,00 en lugar de 125,00)                            |          **Sí**           | Error de captura del conteo; no cambia ninguna venta                                           |
| Efectivo contado mal hecho y recontado después (billete hallado en otro compartimento) |          **Sí**           | Error del conteo; el recuento se documenta en el motivo                                        |
| Fondo inicial mal digitado al abrir (2.000 en lugar de 200)                            |          **Sí**           | Error de captura de la apertura; altera el esperado sin que exista dinero                      |
| Observación del cierre incompleta o equivocada                                         |          **Sí**           | Se añade una observación complementaria; la original no se borra                               |
| Cobro registrado con el medio equivocado (efectivo en vez de QR)                       |          **No**           | Es dato de la venta: modificarlo es una anulación encubierta (DEC-V07). Incidencia (C5, RK-05) |
| Importe de un pago, vuelto o total de una venta                                        |          **No**           | Dato de la venta (DEC-V07)                                                                     |
| Venta duplicada, venta errónea o pieza equivocada                                      |          **No**           | Incidencia fuera del sistema (C5); SD-A03 sigue pendiente                                      |
| Venta asignada a otra sesión                                                           |          **No**           | La venta no se reasigna (inmutable)                                                            |
| Dinero que salió de la caja (gasto, retiro, devolución a un cliente)                   |          **No**           | B6 excluye movimientos; queda como diferencia con su observación                               |
| Reabrir la sesión para seguir vendiendo                                                |          **No**           | B7                                                                                             |

**Regla de diseño [RECOMENDACIÓN DELEGADA]:** solo se corrigen datos que **teclea quien abre o
cierra** (fondo, contado, observación). Todo lo que **se deriva de las ventas** (cobros en efectivo,
totales por medio, cantidad de ventas) es inmutable y no tiene vía de corrección.

---

## 3. Opciones evaluadas

| Opción | Descripción                                                                             | Pros                                                           | Contras                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A      | Reapertura solo del Administrador (`CLOSED → OPEN`), corrige y vuelve a cerrar          | Familiar; reutiliza el cierre                                  | **Contradice B7.** Rompe la inmutabilidad del cierre; choca con «una sola sesión abierta»; permite vender en una sesión pasada |
| B      | Corrección append-only en tabla aparte; la sesión cerrada no se toca                    | Respeta B6, B7 y DEC-V09; original intacto; trazable; acotable | Una tabla, un permiso y dos rutas más; los reportes muestran cifra original y cifra corregida                                  |
| C      | Solo observación posterior (texto), sin cifras                                          | Mínimo esfuerzo; imposible tocar importes                      | El error numérico queda como única cifra; reportes de diferencias engañosos; el lector debe recalcular a mano                  |
| D      | Edición directa de la sesión cerrada por el Administrador, con auditoría `before/after` | Lo más simple de programar                                     | Viola «datos del cierre como información histórica»; obliga a relajar el trigger; la auditoría sería la única huella           |
| E      | Arrastrar la corrección a la sesión siguiente (fondo o nota de la siguiente)            | Sin tabla nueva                                                | Mezcla sesiones; la sesión con el error sigue mal; con B6 no hay movimientos donde registrarla                                 |
| F      | Ninguna vía                                                                             | Cero trabajo                                                   | No cumple lo pedido por el responsable                                                                                         |

**[RECOMENDACIÓN DELEGADA]: opción B**, corrección append-only acotada a tres tipos (contado, fondo,
observación), con permiso exclusivo del Administrador.

Fundamentos:

- Es la única opción que **corrige cifras** y a la vez **no modifica** la sesión cerrada (B7 y
  DEC-V09).
- Sigue el patrón ya usado en el proyecto: libro append-only con valor anterior y nuevo (ADR-007),
  auditoría en la misma transacción (ADR-010) y autorización por permiso (ADR-004).
- La lista cerrada de tipos impide por construcción tocar ventas o pagos (DEC-V07).
- La opción C es más simple, pero deja como única cifra una que se sabe falsa; B cuesta poco más.

---

## 4. Opción recomendada

| Aspecto                  | Diseño **[RECOMENDACIÓN DELEGADA]**                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Qué se corrige           | `COUNTED_CASH` (efectivo contado), `OPENING_AMOUNT` (fondo inicial) y `NOTE` (observación complementaria)                |
| Sobre qué sesión         | Solo sesiones `CLOSED` (ver SC-3 para el fondo de una sesión abierta)                                                    |
| Cómo                     | Inserción de una fila en `cash_session_corrections`; `cash_sessions` no cambia                                           |
| Quién                    | Solo quien tenga el permiso propuesto `cash:correct`; por defecto, únicamente el rol Administrador                       |
| Requisitos               | Motivo obligatorio; valor anterior visto por el usuario (control de concurrencia); valor nuevo distinto del anterior     |
| Cifras resultantes       | El servidor calcula esperado y diferencia resultantes; el cliente nunca envía esperado ni diferencia                     |
| Cuántas correcciones     | Sin límite técnico; cada una encadena con la anterior del mismo tipo                                                     |
| Qué ve el resto          | Historial y detalle muestran cifras originales, cifras vigentes y la marca «Corregida (N)» con el detalle de cada cambio |
| Efecto en stock y ventas | Ninguno; el módulo de caja no llama a la fachada de inventario ni escribe tablas de ventas                               |

### 4.1 Cifras vigentes de una sesión

| Cifra               | Original (en `cash_sessions`, inmutable) | Vigente (calculada)                                                      |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Fondo inicial       | `opening_amount`                         | Último `new_value` de tipo `OPENING_AMOUNT`, o el original               |
| Cobros en efectivo  | `cash_sales_total`                       | **Siempre el original** (sale de ventas inmutables)                      |
| Movimientos de caja | `cash_movements_net` (0 por B6)          | **Siempre el original**                                                  |
| Efectivo esperado   | `expected_cash`                          | Fondo vigente + cobros en efectivo + movimientos                         |
| Efectivo contado    | `counted_cash`                           | Último `new_value` de tipo `COUNTED_CASH`, o el original                 |
| Diferencia          | `difference`                             | Contado vigente − esperado vigente                                       |
| Observaciones       | `notes`                                  | `notes` original + observaciones complementarias en orden, sin reemplazo |

El esperado vigente **nunca se teclea**: solo cambia si cambia el fondo, y su componente de ventas es
el congelado al cerrar. Así se respeta «evitar modificar directamente el importe esperado» (DEC-V09).

### 4.2 Ejemplo

| Paso                      | Fondo | Cobros efectivo | Esperado | Contado | Diferencia |
| ------------------------- | ----: | --------------: | -------: | ------: | ---------: |
| Cierre original           | 2.000 |             450 |    2.450 |     650 |     −1.800 |
| Corrección 1: fondo → 200 |   200 |             450 |      650 |     650 |          0 |

La sesión conserva el cierre original (−1.800) y muestra «Corregida (1)» con la cifra vigente (0), el
motivo, quién corrigió y cuándo.

---

## 5. Modelo de datos esquemático

> Ilustrativo. Lo diseña el database-agent cuando exista autorización; requiere ADR (se propone
> incluirlo en ADR-028, caja y arqueo) y migración con SQL adicional (`--create-only`).

### 5.1 Tabla `cash_session_corrections` (append-only)

| Columna               | Tipo                   | NULL | Nota                                                              |
| --------------------- | ---------------------- | ---- | ----------------------------------------------------------------- |
| `id`                  | uuid                   | NN   | PK (UUID v7 generado por Prisma)                                  |
| `cash_session_id`     | uuid                   | NN   | FK → `cash_sessions` **RESTRICT**                                 |
| `sequence`            | integer                | NN   | 1, 2, 3… por sesión; `UNIQUE (cash_session_id, sequence)`         |
| `kind`                | `cash_correction_kind` | NN   | Enum cerrado: `COUNTED_CASH`, `OPENING_AMOUNT`, `NOTE`            |
| `previous_value`      | numeric(12,2)          | sí   | Valor vigente antes de corregir; NULL solo en `NOTE`              |
| `new_value`           | numeric(12,2)          | sí   | Valor nuevo; NULL solo en `NOTE`                                  |
| `expected_cash_after` | numeric(12,2)          | NN   | Esperado vigente tras esta corrección (calculado por el servidor) |
| `counted_cash_after`  | numeric(12,2)          | NN   | Contado vigente tras esta corrección                              |
| `difference_after`    | numeric(12,2)          | NN   | `counted_cash_after − expected_cash_after`                        |
| `reason`              | varchar(500)           | NN   | Motivo obligatorio; en `NOTE`, es la observación complementaria   |
| `corrected_by_id`     | uuid                   | NN   | FK → `users` **RESTRICT**                                         |
| `corrected_at`        | timestamptz(3)         | NN   | Fijada por el servidor                                            |
| `client_request_id`   | uuid                   | NN   | **UNIQUE**; idempotencia                                          |
| `request_hash`        | char(64)               | NN   | Hash del cuerpo; misma clave con cuerpo distinto responde 409     |

Columnas que **no** existen a propósito: `sale_id`, `sale_payment_id`, `payment_method_id`,
`cash_sales_total`, `expected_cash` (como entrada), importe con signo o «tipo de devolución».

### 5.2 Restricciones

| Restricción          | Contenido (ilustrativo)                                          |
| -------------------- | ---------------------------------------------------------------- |
| Coherencia de tipo   | `kind = 'NOTE'` ⇔ `previous_value IS NULL AND new_value IS NULL` |
| Valores no negativos | `new_value >= 0` cuando existe                                   |
| Cambio real          | `new_value <> previous_value` cuando existen                     |
| Aritmética           | `difference_after = counted_cash_after - expected_cash_after`    |
| Motivo               | `length(btrim(reason)) >= 10`                                    |
| Hash                 | `request_hash ~ '^[0-9a-f]{64}$'`                                |

### 5.3 Triggers

| Trigger                                  | Momento                 | Qué hace                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash_session_corrections_append_only`   | BEFORE UPDATE OR DELETE | Siempre lanza excepción (mismo patrón que `prevent_append_only_change`)                                                                                                                                                                                                                        |
| `cash_session_corrections_validate`      | BEFORE INSERT           | Exige sesión `CLOSED`; recalcula el valor vigente del tipo y exige que `previous_value` coincida; recalcula `expected_cash_after` = fondo vigente + `cash_sales_total` + `cash_movements_net` congelados y `counted_cash_after`; exige `sequence` = última + 1. Si algo no coincide, excepción |
| `cash_sessions_guard` (del documento 03) | Sin cambios             | La sesión `CLOSED` sigue inmutable: la corrección no la actualiza                                                                                                                                                                                                                              |

```sql
-- ilustrativo, no es una migración
CREATE TYPE cash_correction_kind AS ENUM ('COUNTED_CASH', 'OPENING_AMOUNT', 'NOTE');

CREATE TRIGGER cash_session_corrections_append_only
  BEFORE UPDATE OR DELETE ON cash_session_corrections
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
```

Contra `TRUNCATE`, rige lo ya recomendado para el resto del libro: quitar ese privilegio al usuario de
la aplicación en producción (D3), no un trigger.

### 5.4 Escritor único

| Tabla                      | `INSERT`      | `UPDATE`                                     | `DELETE` | Lee                        |
| -------------------------- | ------------- | -------------------------------------------- | -------- | -------------------------- |
| `cash_session_corrections` | módulo `cash` | nunca                                        | nunca    | `cash`, `reports`, `audit` |
| `cash_sessions`            | módulo `cash` | solo el cierre (sin cambios por este diseño) | nunca    | `cash`, `sales`, `reports` |

---

## 6. Permiso y quién corrige

| Elemento                  | Propuesta                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Permiso nuevo             | `cash:correct` · «Corregir errores de captura de un cierre de caja (contado, fondo, observación)»                                        |
| Administrador             | Lo recibe **automáticamente**: `ADMIN` usa `ALL_PERMISSIONS`, y el seed agrega los permisos faltantes al rol sin quitar otros [CÓDIGO]   |
| Responsable de inventario | **No** lo recibe: su lista es explícita y no debe incluir `cash:correct`. Aunque abra y cierre caja (B3), no corrige sus propios cierres |
| Vendedor                  | No lo recibe                                                                                                                             |
| Lectura de correcciones   | Con `cash:read` (asignación a roles pendiente, Q-V13)                                                                                    |

Qué implica que el Responsable **no** tenga el permiso:

- El Responsable cierra la caja pero no puede corregir su propio cierre: hay separación entre quien
  cuenta y quien corrige, salvo cuando el Administrador cierra y corrige (SC-2).
- Si el Administrador no está, la corrección espera. No bloquea la operación: la caja siguiente se
  abre igual; solo queda pendiente la cifra vigente de la sesión anterior.
- La regla «solo el Administrador» se cumple **por permiso**, no por código de rol (ADR-004). Como los
  roles son filas de la base y el seed nunca quita permisos, asignar `cash:correct` a otro rol (a mano
  o con una futura pantalla de roles, P-46) contradiría la decisión. Controles: prueba unitaria sobre
  `DEFAULT_ROLE_PERMISSIONS` (solo `ADMIN` lo tiene); si se construye la pantalla de roles, advertir
  que ese permiso es exclusivo del Administrador por decisión del responsable.
- Los dos administradores previstos (D6) tienen el permiso; ver SC-2 sobre la autocorrección.

---

## 7. Contrato propuesto de API y pantallas

> PROPUESTA. Prefijo `/api/v1`, formato `{ data }`, Zod estricto en cuerpo y respuesta, autorización
> en `preValidation`.

| #   | Ruta                                  | Permiso        | Cuerpo / respuesta                                                                                                        | Errores                                                                                                                                                             |
| --- | ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | `POST /cash/sessions/:id/corrections` | `cash:correct` | `{kind, expectedPreviousValue?, newValue?, reason, clientRequestId}` → `201 {data: correction, session: cifras vigentes}` | 400 (tipo desconocido, clave extra, negativo, sin cambio, motivo corto); 404; 409 `CASH_SESSION_NOT_CLOSED`; 409 `CASH_CORRECTION_CONFLICT` (valor anterior cambió) |
| K2  | `GET /cash/sessions/:id/corrections`  | `cash:read`    | `200 {data: [correction]}` en orden de `sequence`                                                                         | 404                                                                                                                                                                 |

- No existen `PATCH`, `PUT` ni `DELETE` sobre correcciones ni sobre sesiones, ni ruta de reapertura.
- El detalle de sesión (ruta C5 del documento 02) agrega `corrections: { count, lastAt }` y las cifras
  vigentes junto a las originales.
- Pantalla: en el detalle de una sesión cerrada, botón «Corregir cierre» visible solo con
  `cash:correct` (UX; la seguridad está en la API). Diálogo con tipo, valor actual (solo lectura),
  valor nuevo, motivo obligatorio y vista previa del esperado y la diferencia resultantes; confirmación
  con diálogo accesible.
- El historial `/caja/historial` muestra la marca «Corregida (N)» con texto, no solo color.

---

## 8. Auditoría

| Acción                   | Entidad       | Contenido                                                                                                                          |
| ------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `cash_session.corrected` | `CashSession` | `before` (valor anterior, esperado y diferencia vigentes) y `after` (valor nuevo, esperado y diferencia), tipo, motivo, `sequence` |

- `recordAudit(tx, …)` en la misma transacción que la inserción (ADR-010); si una falla, no queda
  ninguna.
- Los intentos rechazados (403, 409) no generan fila de auditoría de negocio; quedan en el log técnico
  con `requestId`.
- Etiqueta nueva en `audit-labels.ts` (cambio de frontend futuro).

---

## 9. Efecto sobre el arqueo y los reportes

| Regla **[RECOMENDACIÓN DELEGADA]**                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El cierre original nunca se reescribe; toda vista y exportación que muestre cifras de una sesión corregida muestra **ambas**: original y vigente.                    |
| La marca «Corregida (N)» acompaña a la sesión en historial, detalle y reportes; nunca se sustituye en silencio la cifra original.                                    |
| Un resumen de cierre ya impreso (si se aprueba N-3) no se regenera; reimprimirlo después de una corrección lo rotula «Corregido el … por …».                         |
| Las sumas de diferencias por periodo (cuando E5 se defina) informan total original, total vigente y cantidad de sesiones corregidas.                                 |
| Corregir una sesión **no** afecta a ninguna otra: el fondo de cada sesión se digita (B4), no se arrastra.                                                            |
| Los cobros por medio, la cantidad de ventas y los cobros QR y transferencia de la sesión no cambian con ninguna corrección.                                          |
| Verificación global (junto a `db:verify-ledger`): para cada sesión, la cadena de correcciones es consistente y los cobros congelados coinciden con los recalculados. |
| Diferencia vigente distinta de cero: el motivo obligatorio de la corrección cumple el papel de observación exigido por B5.                                           |

---

## 10. Concurrencia e idempotencia

| Situación                                    | Tratamiento **[RECOMENDACIÓN TÉCNICA]**                                                                                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dos administradores corrigen la misma sesión | `SELECT … FROM cash_sessions WHERE id = :id FOR UPDATE` al inicio (bloquear no es modificar: el guard no se dispara); la segunda espera y luego compara `expectedPreviousValue`: si cambió, 409 `CASH_CORRECTION_CONFLICT` |
| Reintento por red                            | Mismo `clientRequestId` y mismo cuerpo: devuelve la misma corrección. Mismo `clientRequestId` con cuerpo distinto: 409                                                                                                     |
| Corrección frente a ventas en curso          | Sin interacción: las ventas bloquean solo la sesión `OPEN` (`FOR SHARE`); la corrección solo toca sesiones `CLOSED`                                                                                                        |
| Corrección frente a un cierre en curso       | El cierre tiene la sesión con `FOR UPDATE`; la corrección espera y, al obtener el bloqueo, ve la sesión ya `CLOSED` o rechaza con 409 si sigue `OPEN`                                                                      |
| Orden de bloqueo                             | Una sola fila de `cash_sessions`; no toca variantes ni saldos, por lo que no forma ciclos con el orden «sesión → venta → variantes → saldos» del documento 02                                                              |
| Tiempo máximo                                | Mismo límite de transacción actual (30 s) y respuesta 503 con `Retry-After` ante conflicto transitorio [CÓDIGO]                                                                                                            |

---

## 11. Controles contra la anulación encubierta

Esta vía no debe servir para deshacer una venta, devolver dinero o esconder un faltante. Controles
propuestos **[RECOMENDACIÓN DELEGADA]**:

| #     | Control                                                                                                                                                                          | Tipo            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| AE-1  | Lista cerrada de tipos en un enum de la base: contado, fondo y observación. Agregar un tipo exige migración, ADR y autorización expresa                                          | Base de datos   |
| AE-2  | La tabla no tiene columnas ni FK hacia `sales`, `sale_items`, `sale_payments` ni medios de pago: no puede referirse a una venta                                                  | Base de datos   |
| AE-3  | Zod estricto: claves como `saleId`, `paymentId`, `methodId`, `expectedCash` o `cashSalesTotal` se rechazan con 400                                                               | API             |
| AE-4  | El trigger recalcula el esperado con los cobros **congelados**; ninguna corrección puede restar el efectivo de una venta                                                         | Base de datos   |
| AE-5  | Ventas, líneas y pagos siguen inmutables por sus propios triggers; el módulo `cash` no escribe en tablas de ventas (escritor único)                                              | Base de datos   |
| AE-6  | Sin efecto en stock: el módulo `cash` no llama a la fachada de inventario; una prueba verifica que el libro no cambia                                                            | Código y prueba |
| AE-7  | No existe tipo «egreso», «devolución» ni importe con signo: una corrección no representa dinero que sale                                                                         | Base de datos   |
| AE-8  | Solo `cash:correct` (Administrador); prueba sobre el mapeo por defecto y 403 para Responsable y Vendedor                                                                         | Permiso         |
| AE-9  | Cifra original siempre visible junto a la vigente; marca «Corregida (N)»; nada se reemplaza en silencio                                                                          | Reportes        |
| AE-10 | Motivo obligatorio y auditoría en la misma transacción; quien cerró la sesión ve la corrección (si tiene `cash:read`, SC-5)                                                      | Trazabilidad    |
| AE-11 | Informe de correcciones (amplía CT-14 del documento 07), con atención a las que **suben el contado** o **bajan el fondo** (ambas reducen un faltante); revisión periódica (SC-4) | Procedimiento   |
| AE-12 | Procedimiento: si el motivo describe una devolución, una venta errónea o un cobro mal clasificado, no es una corrección de cierre: es una incidencia (C5)                        | Procedimiento   |
| AE-13 | Cruce con conteos: una corrección que reduce un faltante y un conteo físico posterior con sobrante de la misma pieza vendida se señalan juntos en el informe CT-14               | Procedimiento   |

Límite honesto: el sistema no puede verificar que un recuento físico existió. Si un Administrador sube
el contado para ocultar un faltante, la cifra original y la auditoría lo dejan a la vista, pero no lo
impiden. Ese riesgo depende de la confianza en el rol y de la revisión del informe (SC-4).

---

## 12. Pruebas necesarias

Solo se listan; no se escribió ni ejecutó ninguna. Patrones del proyecto: base real, `buildTestApp`,
`login`, `createTestUser`, `resetDatabase`.

| Nivel                 | Casos                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias             | Cálculo de cifras vigentes desde el original y la cadena de correcciones; prueba de propiedad: con cualquier secuencia válida, esperado vigente = fondo vigente + cobros congelados y diferencia = contado − esperado                           |
| Permisos (compartido) | `DEFAULT_ROLE_PERMISSIONS`: solo `ADMIN` contiene `cash:correct`; `INVENTORY_MANAGER` y `SELLER` no                                                                                                                                             |
| 401 / 403             | Sin sesión: 401. **Vendedor: 403. Responsable de inventario: 403**, incluso sobre una sesión que él cerró. Usuario con `cash:read`, `cash:open` y `cash:close` pero sin `cash:correct`: 403. Administrador: 201                                 |
| 400                   | `kind` desconocido (`SALE_AMOUNT`, `PAYMENT_METHOD`, `EXPECTED_CASH`); claves extra (`saleId`, `paymentId`, `expectedCash`); valor negativo; valor igual al vigente; motivo vacío o corto; `NOTE` con valores numéricos                         |
| 404 / 409             | Sesión inexistente: 404. Sesión `OPEN`: 409 `CASH_SESSION_NOT_CLOSED`. `expectedPreviousValue` desactualizado: 409 `CASH_CORRECTION_CONFLICT`. Misma clave con cuerpo distinto: 409                                                             |
| Sin vía sobre ventas  | No existen rutas `PATCH`/`PUT`/`DELETE` sobre `/cash/sessions/:id` ni sobre correcciones (404 de ruta); ninguna ruta de caja acepta un identificador de venta o de pago                                                                         |
| Efectos               | Tras una corrección: la fila de `cash_sessions` es idéntica a la anterior; `sales`, `sale_items`, `sale_payments`, `inventory_movements` e `inventory_balances` sin cambios (recuento y contenido); una fila de auditoría `before/after`        |
| Base de datos         | `UPDATE` y `DELETE` sobre correcciones fallan; `UPDATE` de una sesión `CLOSED` sigue fallando; inserción directa con `previous_value` falso, `expected_cash_after` incoherente o `sequence` salteada falla; inserción sobre sesión `OPEN` falla |
| Atomicidad            | Fallo simulado tras insertar la corrección: no queda corrección ni auditoría                                                                                                                                                                    |
| Concurrencia          | Dos correcciones simultáneas con el mismo valor anterior: una 201 y otra 409. Mismo `clientRequestId`: una sola fila y respuestas iguales. Mutante: quitar el `FOR UPDATE` debe hacer fallar la prueba                                          |
| Reportes              | Una sesión corregida muestra cifra original, cifra vigente y la marca; la suma del periodo informa ambos totales                                                                                                                                |
| Componentes y E2E     | Botón oculto sin `cash:correct`; diálogo con motivo obligatorio y vista previa; anuncio `aria-live` de la diferencia resultante                                                                                                                 |

---

## 13. Riesgos

| Riesgo                                                                 | Control                                                 | Residual                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| El Administrador usa la corrección para ocultar un faltante            | AE-9 a AE-11, AE-13; original visible                   | Medio: depende de la revisión (SC-4) y sin 2FA (D7)                   |
| La corrección se usa para compensar una venta errónea o una devolución | AE-1 a AE-7, AE-12                                      | Bajo en el sistema; el dinero real sale igual y queda como diferencia |
| Confusión entre cifras originales y vigentes en reportes               | AE-9; rótulos en pantalla y CSV                         | Bajo                                                                  |
| Presión para agregar tipos (medio de pago, importe de cobro)           | AE-1: requiere migración, ADR y autorización            | Bajo si se respeta el proceso                                         |
| Ausencia del Administrador demora la corrección                        | No bloquea la operación                                 | Bajo                                                                  |
| Asignación manual de `cash:correct` a otro rol                         | Prueba del mapeo; aviso en una futura pantalla de roles | Bajo                                                                  |
| Un Administrador corrige su propio cierre sin control de un segundo    | SC-2; informe de correcciones                           | Medio hasta decidir SC-2                                              |

---

## 14. Subdecisiones que siguen abiertas

Todas **[PENDIENTE]**; la recomendación no se da por aprobada.

| ID   | Pregunta                                                                      | Opciones                                                              | Recomendación técnica                                                             |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| SC-1 | ¿Hay plazo para corregir un cierre?                                           | Sin plazo / hasta abrir la sesión siguiente / N días                  | Sin plazo técnico; el informe muestra la antigüedad                               |
| SC-2 | ¿Un Administrador puede corregir un cierre que él mismo hizo?                 | Sí / solo el otro Administrador                                       | Sí, señalado en el informe; con dos administradores (D6) se podría exigir el otro |
| SC-3 | ¿Se puede corregir el fondo de una sesión todavía abierta?                    | No (solo tras cerrar) / sí, con el mismo permiso                      | No: se corrige tras el cierre, con una sola regla                                 |
| SC-4 | ¿Quién revisa el informe de correcciones y cada cuánto?                       | El otro Administrador / el responsable del negocio; semanal / mensual | Revisión semanal por un Administrador distinto del que corrigió                   |
| SC-5 | ¿Quien cerró ve la corrección de su cierre?                                   | Sí (con `cash:read`) / no                                             | Sí; depende de asignar `cash:read` (Q-V13)                                        |
| SC-6 | ¿Una corrección que sube el contado exige un recuento presencial con testigo? | Sí, como procedimiento / no                                           | Sí, como procedimiento (no verificable por el sistema)                            |

Relacionadas, fuera de este documento: cero y tope del fondo inicial (B4); conteo por denominaciones
(N-2 del documento 02), que obligaría a corregir también el detalle; formato del número de sesión
(N-6).

---

## 15. Impacto en otros documentos

| Documento                                 | Cambio                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [02](02-diseno-funcional-caja.md)         | Nota «Actualización 2026-11-09»; fondo, reapertura y corrección remiten aquí                       |
| [03](03-modelo-de-datos-ventas-y-caja.md) | Nota «Actualización 2026-11-09»; tabla `cash_session_corrections` como adición propuesta           |
| [07](07-matriz-de-riesgos.md)             | Nota «Actualización 2026-11-09»; riesgo de corrección indebida y sus controles (§11 y §13 de aquí) |
| [08](08-subdecisiones-pendientes.md)      | Nota «Actualización 2026-11-09»; SD-C03 y SD-C06 remiten aquí; SC-1 a SC-6 nuevas                  |
| ADR-028 (propuesto, no existe)            | Debería incluir la corrección append-only, el permiso `cash:correct` y los controles AE            |
| `PENDIENTES.md`                           | Constancia de la aclaración de B6 y B7                                                             |

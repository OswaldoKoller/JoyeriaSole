# 11 · Plan de implementación de Ventas y Caja (E1 + E3)

> **Estado:** plan ejecutable para los agentes backend, database, frontend y testing.
> **Fecha:** 2026-11-10 · **Rama:** `feature/f2-integracion` · **Autor:** agente de arquitectura.
> **Fuentes:** documentos [01](01-matriz-de-decisiones.md) a [10](10-correcciones-de-caja.md) de esta
> carpeta, [RESOLUCIONES-2026-11-07](../../business/RESOLUCIONES-2026-11-07.md),
> [RESOLUCIONES-2026-11-09](../../business/RESOLUCIONES-2026-11-09.md) (incluidas las «Aclaraciones
> posteriores»), [PENDIENTES.md](../../business/PENDIENTES.md) y el código de la rama.
>
> Etiquetas: **CONFIRMADA** (cita la resolución), **POR DEFECTO — PENDIENTE DE CONFIRMACIÓN** (valor
> conservador y reversible tomado de los documentos; el responsable debe revisarlo) y **FUERA** (no se
> implementa).

## 0. Autorización, precondiciones y regla innegociable

| #   | Punto                 | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Autorización          | El orquestador comunica que el responsable autorizó el 2026-11-10, de forma expresa, implementar «todo el módulo de Ventas», además de idempotencia, garantías de BD, roles y miniaturas (en curso por otros agentes).                                                                                                                                                                                                                                                                                     |
| 0.2 | **Hueco documental**  | **Resuelto el 2026-11-10:** se creó `docs/business/RESOLUCIONES-2026-11-10.md` con el texto literal y se actualizó `CLAUDE.md`. Situación original: la autorización **no constaba en el repositorio**: `CLAUDE.md` de esta rama sigue diciendo «Fase 2: solo ANÁLISIS» y prohíbe implementar Ventas; RESOLUCIONES-2026-11-09 dice «NO autorizado». Antes de S1 debe existir `docs/business/RESOLUCIONES-2026-11-10.md` con el texto literal del responsable, y el responsable debe actualizar `CLAUDE.md`. |
| 0.3 | Regla innegociable    | **DEC-V07** (resolución 2026-11-07 §2): nunca `POST /sales/:id/void`, permiso `sales:void`, movimiento `SALE_VOID`, estado `VOIDED`, botones de anulación, borrado o edición de ventas confirmadas, ni reversión encubierta (ajuste, cambio inverso, pago negativo, corrección de caja, incidencia con efecto, venta compensatoria).                                                                                                                                                                       |
| 0.4 | Advertencia legal     | Siguen abiertas SD-A04 (devoluciones obligatorias por ley) y SD-R07 (requisitos del contador). No bloquean la implementación; **sí condicionan operar con dinero real** (piloto E7).                                                                                                                                                                                                                                                                                                                       |
| 0.5 | Dependencias externas | (a) helper genérico de idempotencia con cabecera `Idempotency-Key` (otro agente); (b) garantías de BD I-01, I-02 e I-05 (otro agente); (c) libro unificado en `modules/inventory` (A1 a, ya aplicado: `applyStockChanges` valida `requireActive`).                                                                                                                                                                                                                                                         |
| 0.6 | ADR previos al código | Rebanada S0 (agente de arquitectura): redactar y aceptar los ADR de §10.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.7 | Navegación            | En esta rama **no existe** `apps/web/src/app/navigation.tsx`: el menú (`GROUPS`) vive en `apps/web/src/app/app-shell.tsx`. Si al integrar existe `navigation.tsx`, los cambios de menú van en el archivo que contenga `GROUPS`.                                                                                                                                                                                                                                                                            |

## 1. Alcance exacto

### 1.1 Dentro del alcance

| Bloque                    | Qué se construye                                                                                                                                                                                                                                                                                                      | Fuente                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| E1 · Venta de mostrador   | Carrito en el navegador; alta de líneas por lector de códigos (teclado + Enter) o búsqueda; pagos en Bs con efectivo, QR, transferencia y combinaciones; vuelto calculado por el servidor; pantalla de revisión; confirmación atómica e idempotente que descuenta stock con `applyStockChanges` y movimientos `SALE`. | Q-V01, Q-V03, Q-V04, Q-V05, DEC-V07 §2             |
| E1 · Comprobante interno  | Vista previa e impresión por el navegador en 58 mm, 80 mm, A5 y A4; A4 por defecto, recordado por navegador; leyendas «Comprobante interno» y «No válido como factura fiscal»; reimpresión con marca «Copia» y auditoría.                                                                                             | DEC-V12, C3, C4                                    |
| Configuración del negocio | Registro único en BD con nombre comercial, dirección, teléfono y NIT opcional; valores provisionales editables por el Administrador.                                                                                                                                                                                  | C1, C2                                             |
| E3 · Caja única           | Apertura con fondo inicial obligatorio de monto libre; no se vende sin sesión abierta; cada venta queda asociada a la sesión; cierre con arqueo (esperado, contado, diferencia; observación obligatoria si la diferencia no es cero; sin tolerancia); QR y transferencia informados aparte; historial de sesiones.    | DEC-V09, B1 a B9                                   |
| Correcciones de caja      | Registro append-only sobre sesiones cerradas, solo Administrador (`cash:correct`): contado, fondo y observación complementaria.                                                                                                                                                                                       | Aclaración B6/B7, [10](10-correcciones-de-caja.md) |
| Incidencias de venta      | Registro de trazabilidad: reportan Vendedor y Responsable; ve y cierra el Administrador. **Sin efecto en stock, importes, pagos ni caja.** Ver contradicción X-1 (§9).                                                                                                                                                | C5, C6                                             |
| Historial de ventas       | Listado paginado con filtros y detalle de solo lectura.                                                                                                                                                                                                                                                               | DEC-V07 («mantener auditoría e historial»)         |

### 1.2 Fuera del alcance (no implementar)

| Tema                                                                               | Motivo                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **E2 Anulaciones** y cualquier reversión, rectificación o documento compensatorio  | DEC-V07; C5                                                                   |
| **E4 Cambios de pieza ligados a ventas**, `sales:exchange`, vínculo cambio ↔ venta | Q-V08 y P-30 diferidas (F4). `POST /inventory/exchanges` (ADR-019) no se toca |
| **E5 Reportes de ventas**, márgenes, exportaciones, informe CT-14 y CT-16          | Q-V15 diferida (F4); SD-A08 pendiente                                         |
| Descuentos, venta bajo costo                                                       | Q-V06 y Q-V16 pendientes                                                      |
| Clientes, datos del comprador en el comprobante                                    | Q-V10 pendiente                                                               |
| Créditos, apartados, reservas de stock                                             | Q-V05                                                                         |
| Impuestos, factura fiscal, número de factura externa (`invoice_reference`)         | Q-V02, Q-V03, B11                                                             |
| Otras monedas, tarjeta, integración bancaria, conciliación de QR y transferencia   | Q-V04, B8, `CLAUDE.md`                                                        |
| Gastos, retiros y `cash_movements`; reapertura de caja; tolerancia de arqueo       | B6, B7, B5                                                                    |
| Conteo por denominaciones (N-2), resumen de cierre impreso (N-3), arqueo ciego     | No decididos; no bloquean                                                     |
| Ventas retroactivas, modo sin conexión, talonario de contingencia en el sistema    | Q-V14 pendiente; SD-G12                                                       |
| Aviso de «venta idéntica reciente» (SD-A03 b)                                      | Pendiente                                                                     |
| Logo en el comprobante, ancho libre en milímetros                                  | SD-R08 (a): sin logo hasta que se entregue                                    |
| CRUD de medios de pago, multi-caja, multi-sucursal, subtotales por vendedor        | SD-G07 pendiente; B9                                                          |
| Segundo aprobador o 2FA                                                            | P-43 aceptada por el responsable; D7                                          |

## 2. Tabla de decisiones

### 2.1 Reglas CONFIRMADAS

| ID   | Regla                                                                                                                                                         | Fuente                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| R-01 | Venta de mostrador con comprobante interno                                                                                                                    | Q-V01 (res. 2026-11-07 §1)               |
| R-02 | Facturación fiscal en sistema externo; no se guarda el número de factura                                                                                      | Q-V02; B11                               |
| R-03 | El precio registrado es el total cobrado; la aplicación no añade impuestos                                                                                    | Q-V03                                    |
| R-04 | Pagos en efectivo, QR, transferencia y combinaciones, solo en Bs                                                                                              | Q-V04                                    |
| R-05 | Solo ventas pagadas íntegramente en el acto: Σ pagos = total                                                                                                  | Q-V05                                    |
| R-06 | Una venta confirmada no se anula, borra ni modifica; se conserva auditoría e historial                                                                        | DEC-V07 (res. 2026-11-07 §2)             |
| R-07 | Controles previos: mostrar líneas y precios definitivos, validar stock, confirmar suma de pagos, idempotencia, transacción atómica, carrito corregible        | DEC-V07 §2 «Prevención de errores»       |
| R-08 | Venta errónea: incidencia; sin ajuste de stock ni documento compensatorio; sin venta compensatoria; el desfase se regulariza en el conteo ordinario (ADR-021) | C5 y su aclaración                       |
| R-09 | Reportan incidencias el Vendedor y el Responsable de inventario; las ve el Administrador, que atiende y cierra                                                | C6; aclaración C5                        |
| R-10 | Caja lógica única con apertura, cobros, cierre y arqueo; una sola sesión abierta garantizada en BD; cierre idempotente; cierre histórico                      | DEC-V09 (res. 2026-11-07 §3)             |
| R-11 | Venta y caja se liberan juntas; no se vende sin sesión abierta; toda venta pertenece a una sesión                                                             | B1, B2                                   |
| R-12 | Abren y cierran la caja el Administrador y el Responsable de inventario; el Vendedor no                                                                       | B3                                       |
| R-13 | Fondo inicial obligatorio, digitado en campo libre en cada apertura, sin arrastre                                                                             | B4 y su aclaración                       |
| R-14 | Toda diferencia de arqueo se registra con observación obligatoria; sin tolerancia ni bloqueo por monto                                                        | B5                                       |
| R-15 | Sin gastos ni retiros: esperado = fondo + cobros en efectivo                                                                                                  | B6                                       |
| R-16 | Sin reapertura de una caja cerrada                                                                                                                            | B7                                       |
| R-17 | Solo el Administrador corrige errores de cierre; vía append-only que no toca la sesión, ventas ni pagos                                                       | Aclaración B6/B7 (delegada)              |
| R-18 | QR y transferencia se informan aparte y no afectan el efectivo                                                                                                | B8                                       |
| R-19 | Cada venta guarda quién la hizo; el arqueo es por sesión                                                                                                      | B9                                       |
| R-20 | Numeración por secuencia; puede haber saltos; independiente de la factura                                                                                     | B10; DEC-V12                             |
| R-21 | Comprobante imprimible desde el navegador; imprimir no crea venta; reimprimir no cambia importes; vínculo permanente                                          | DEC-V12 (res. 2026-11-07 §4)             |
| R-22 | Datos del comprobante: nombre comercial, dirección, teléfono, NIT opcional, logo opcional; viven en configuración en BD                                       | C1 (delegada), C2                        |
| R-23 | A4 por defecto, preferencia recordada por navegador; 58 mm, 80 mm y A5 disponibles                                                                            | C3                                       |
| R-24 | Reimpresión permitida con marca «Copia» y registro de auditoría                                                                                               | C4                                       |
| R-25 | El Vendedor no ve costos en ninguna respuesta                                                                                                                 | P-02 (`CLAUDE.md`, regla 12)             |
| R-26 | Stock nunca negativo; no se vende sin stock                                                                                                                   | P-08 (rige mientras Q-V11 siga abierta)  |
| R-27 | La configuración del sistema es exclusiva del Administrador                                                                                                   | `CLAUDE.md`, regla 7 (`settings:manage`) |
| R-28 | El stock solo cambia vía `modules/inventory`; auditoría en la misma transacción                                                                               | ADR-007, ADR-010                         |

### 2.2 Valores POR DEFECTO — PENDIENTE DE CONFIRMACIÓN (bloquean la implementación)

Cada fila es un valor conservador y reversible propuesto por los documentos. **No es regla de
negocio**: debe registrarse en `PENDIENTES.md` (S0) y revisarse con el responsable.

| ID   | Subdecisión                                                   | Valor por defecto                                                                                                                                      | Cómo queda configurable o reversible                                                                                         | Origen                           |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| D-01 | Quién vende y cobra (Q-V13)                                   | `sales:create` a Vendedor, Responsable y Administrador                                                                                                 | Filas de `role_permissions` (ADR-004); se cambia por seed o pantalla de roles                                                | Q-V13 parcial; 02 §3             |
| D-02 | Visibilidad de ventas ajenas (SD-G03)                         | Vendedor solo ve las suyas (`sales:read`); Responsable y Administrador ven todas (`sales:read-all`)                                                    | Permiso separado                                                                                                             | 08 SD-G03; 04 §7.1               |
| D-03 | Formato del correlativo (SD-R01)                              | `VTA-000001` (prefijo + 6 dígitos con ceros, sin año)                                                                                                  | La BD guarda un entero; el formato es una función de `@joyeria/shared` (`formatSaleNumber`); cambiarlo no requiere migración | 08 SD-R01 (a)                    |
| D-04 | Vendedor en el comprobante (SD-R04)                           | Se guarda siempre el nombre (snapshot `seller_name`); **no se imprime**                                                                                | Interruptor `receipt_show_seller` en la configuración del negocio (Administrador)                                            | 08 SD-R04 (c); 03 §5.7           |
| D-05 | Fondo cero y tope (B4)                                        | Acepta `0` escrito de forma explícita (vacío no es cero); sin tope de negocio (límite técnico `numeric(12,2)`)                                         | Validación en el esquema Zod compartido; `CHECK (opening_amount >= 0)`                                                       | Aclaración B4 (rec. sin aprobar) |
| D-06 | Quién reimprime (C4, SD-R06)                                  | Quien puede ver el comprobante (ventas propias con `sales:read`; todas con `sales:read-all`)                                                           | Por permiso; un permiso propio se añadiría sin migración                                                                     | 04 §11.3                         |
| D-07 | Valores provisionales del negocio (C1)                        | Nombre «Joyería Sole»; dirección, teléfono y NIT vacíos; sin logo                                                                                      | Editables en `/configuracion/negocio`                                                                                        | C1; 08 SD-R08 (a)                |
| D-08 | Encabezado del comprobante en reimpresiones                   | Muestra los datos comerciales **vigentes** (no un snapshot por venta); no afecta importes                                                              | Un snapshot futuro sería una columna nueva                                                                                   | 04 §4.3                          |
| D-09 | Medios de pago y referencia (SD-G07)                          | Catálogo fijo de tres medios sembrados; referencia de QR o transferencia **opcional**, máx. 100 caracteres; no se imprime                              | Catálogo en tabla (un cuarto medio sería una fila); obligatoriedad en Zod                                                    | 03 §5.1 y §5.4                   |
| D-10 | Incidencias dentro del sistema (SD-A06)                       | Entidad `sale_incidents` de solo trazabilidad (opción b). **Contradice** la recomendación delegada «hoja fuera del sistema» (X-1)                      | Rebanadas S4 y S7 separables; pueden omitirse sin afectar el resto                                                           | 08 SD-A06 (b); encargo del 11-10 |
| D-11 | Tipos y visibilidad de incidencias                            | Tipos `WRONG_SALE`, `WRONG_PAYMENT`, `DUPLICATE`, `OTHER`; quien reporta recibe su alta pero **no** lista incidencias; lista y cierra el Administrador | Enum de BD; permisos separados                                                                                               | Res. 2026-11-07 §2; C6           |
| D-12 | Arqueo ciego (N-1)                                            | No ciego: quien tiene `cash:read` ve el esperado en vivo; el asistente de cierre pide primero el contado                                               | Solo UI; el arqueo ciego real exigiría persistir el primer conteo (fuera)                                                    | 02 §15 N-1                       |
| D-13 | Lectura de caja del Responsable (SC-5)                        | `cash:read` al Responsable (necesita ver el arqueo que cierra y sus correcciones)                                                                      | Por permiso                                                                                                                  | 10 SC-5                          |
| D-14 | Correcciones: plazo, autocorrección, sesión abierta (SC-1..3) | Sin plazo; un Administrador puede corregir su propio cierre; solo sesiones `CLOSED`                                                                    | Reglas de servicio; el trigger exige `CLOSED`                                                                                | 10 §14                           |
| D-15 | Límites técnicos de la venta                                  | 1 a 50 líneas; cantidad por línea 1 a 999; una línea por variante; un pago por medio (máx. 3 pagos)                                                    | Constantes en `@joyeria/shared`; sin restricción equivalente en BD salvo `UNIQUE (sale_id, variant_id)`                      | 03 §5.3; 04 §5.3                 |
| D-16 | Sin descuentos, sin clientes, sin fecha retroactiva           | `total = Σ líneas`; venta anónima; `sold_at` lo fija el servidor                                                                                       | Columnas nuevas en una migración futura                                                                                      | Q-V06, Q-V10, Q-V14 abiertas     |
| D-17 | Número de sesión (N-6)                                        | `CAJ-000001`, secuencia con saltos                                                                                                                     | Función de formato compartida                                                                                                | 02 §15 N-6                       |
| D-18 | Sesión que cruza días (N-4)                                   | Permitido; sin cierre automático ni alerta; la pantalla muestra «abierta desde»                                                                        | Solo UI                                                                                                                      | 02 §15 N-4                       |
| D-19 | Marca de copia                                                | Texto «COPIA» desde la segunda impresión registrada de una venta; la primera es el original                                                            | Constante compartida `RECEIPT_COPY_LEGEND`                                                                                   | C4; 04 §11.2 (c)                 |

### 2.3 Pendientes que NO bloquean (quedan fuera)

SD-A02, SD-A03, SD-A04, SD-A05, SD-A07, SD-A08, SD-R07, SD-R08, SD-X01 a SD-X07, SD-G01, SD-G02,
SD-G05, SD-G09, SD-G10, SD-G12, SD-G13, SD-G14, SC-4, SC-6, N-2, N-3, N-5.

## 3. Modelo de datos definitivo

Convenciones: UUID v7 generado por Prisma, `timestamptz(3)`, dinero `numeric(12,2)`, `snake_case`
con `@map`, FK `ON DELETE RESTRICT` en **todas** las tablas nuevas (sin `CASCADE` ni `SET NULL`).
El SQL adicional (CHECK, índices parciales, triggers) va en la migración con
`prisma migrate dev --create-only`.

### 3.1 Enums

| Enum                   | Valores                                             | Nota                                                                                                                                                             |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `movement_type`        | **sin cambios**                                     | `SALE` ya existe (reservado, `schema.prisma` línea 690). No se ejecuta `ADD VALUE`. **No** se agrega `SALE_VOID`. `CUSTOMER_RETURN` y `EXCHANGE` siguen sin uso. |
| `cash_session_status`  | `OPEN`, `CLOSED`                                    | Nuevo                                                                                                                                                            |
| `cash_correction_kind` | `COUNTED_CASH`, `OPENING_AMOUNT`, `NOTE`            | Nuevo; lista cerrada (control AE-1)                                                                                                                              |
| `sale_incident_kind`   | `WRONG_SALE`, `WRONG_PAYMENT`, `DUPLICATE`, `OTHER` | Nuevo (D-11)                                                                                                                                                     |
| `sale_incident_status` | `OPEN`, `CLOSED`                                    | Nuevo                                                                                                                                                            |

En `packages/shared/src/reference-types.ts` se agrega `SALE: 'SALE'` a `REFERENCE_TYPES`.
`sales` **no tiene columna de estado**: una venta existe solo si se confirmó.

### 3.2 `payment_methods` (catálogo sembrado)

| Columna      | Tipo           | Nulo | Nota                                      |
| ------------ | -------------- | ---- | ----------------------------------------- |
| `id`         | uuid           | no   | PK                                        |
| `code`       | varchar(50)    | no   | UNIQUE: `CASH`, `QR`, `BANK_TRANSFER`     |
| `name`       | varchar(100)   | no   | UNIQUE: «Efectivo», «QR», «Transferencia» |
| `is_cash`    | boolean        | no   | `true` solo en `CASH`                     |
| `is_active`  | boolean        | no   | default `true`                            |
| `is_system`  | boolean        | no   | `true` en los tres                        |
| `sort_order` | integer        | no   | 1, 2, 3                                   |
| `created_at` | timestamptz(3) | no   | default `now()`                           |

- `UNIQUE (id, is_cash)` para la FK compuesta de `sale_payments`.
- Siembra en la migración (`uuidv7()`, `ON CONFLICT (code) DO NOTHING`) y en `seed.ts` (`upsert` por
  `code` que no pisa `is_active`), igual que `stock_entry_cost_types`.

### 3.3 `cash_sessions`

| Columna              | Tipo                  | Nulo | Nota                                                                  |
| -------------------- | --------------------- | ---- | --------------------------------------------------------------------- |
| `id`                 | uuid                  | no   | PK                                                                    |
| `number`             | integer               | no   | UNIQUE, `autoincrement()` (secuencia con saltos)                      |
| `status`             | `cash_session_status` | no   | default `OPEN`                                                        |
| `opened_by_id`       | uuid                  | no   | FK `users`                                                            |
| `opened_at`          | timestamptz(3)        | no   | default `now()`; la fija el servidor                                  |
| `opening_amount`     | numeric(12,2)         | no   | Fondo inicial (R-13, D-05)                                            |
| `closed_by_id`       | uuid                  | sí   | FK `users`                                                            |
| `closed_at`          | timestamptz(3)        | sí   |                                                                       |
| `cash_sales_total`   | numeric(12,2)         | sí   | Σ pagos en efectivo de la sesión, congelado al cerrar                 |
| `cash_movements_net` | numeric(12,2)         | sí   | Siempre `0` en el MVP (B6); se conserva por la fórmula de 03          |
| `expected_cash`      | numeric(12,2)         | sí   | Congelado al cerrar                                                   |
| `counted_cash`       | numeric(12,2)         | sí   |                                                                       |
| `difference`         | numeric(12,2)         | sí   | `counted_cash − expected_cash` (positivo sobrante, negativo faltante) |
| `notes`              | varchar(500)          | sí   | Observación del cierre                                                |
| `open_request_id`    | uuid                  | no   | UNIQUE; valor de `Idempotency-Key` de la apertura                     |
| `close_request_id`   | uuid                  | sí   | UNIQUE; valor de `Idempotency-Key` del cierre                         |
| `close_request_hash` | char(64)              | sí   | SHA-256 hex de `{sessionId, countedCash, notes}` canónico             |

Restricciones (SQL):

- `cash_sessions_single_open_idx`: `CREATE UNIQUE INDEX ... ON cash_sessions (status) WHERE status = 'OPEN'`
  (**una sola sesión abierta garantizada en BD**).
- `opening_amount >= 0`; `counted_cash >= 0`; `closed_at >= opened_at`.
- Estado coherente: `(status = 'CLOSED') = (closed_by_id, closed_at, cash_sales_total, cash_movements_net, expected_cash, counted_cash, difference, close_request_id, close_request_hash todos NOT NULL)`.
- `cash_movements_net = 0` cuando no es nulo (B6).
- `expected_cash = opening_amount + cash_sales_total + cash_movements_net`.
- `difference = counted_cash - expected_cash`.
- `status <> 'CLOSED' OR difference = 0 OR (notes IS NOT NULL AND length(btrim(notes)) >= 3)`
  (R-14 en BD; el `IS NOT NULL` es necesario porque un CHECK que evalúa a NULL no falla).
- Índice `cash_sessions_opened_at_idx (opened_at)`.

Trigger `cash_sessions_guard` (`BEFORE UPDATE OR DELETE`, por fila):

1. `DELETE` → excepción.
2. `OLD.status = 'CLOSED'` → excepción siempre (sin reapertura, R-16).
3. `OLD.status = 'OPEN'` y `NEW.status = 'OPEN'` → excepción.
4. `OPEN → CLOSED`: exige que `id`, `number`, `opened_by_id`, `opened_at`, `opening_amount` y
   `open_request_id` no cambien, y **recalcula** `cash_sales_total` (Σ `sale_payments.amount` con
   `method_is_cash` de ventas con `cash_session_id = OLD.id`); si no coincide con `NEW`, excepción.

### 3.4 `sales` (inmutable)

| Columna             | Tipo           | Nulo | Nota                                                                             |
| ------------------- | -------------- | ---- | -------------------------------------------------------------------------------- |
| `id`                | uuid           | no   | PK; se genera en el servicio antes de llamar al libro (`reference_id`)           |
| `number`            | integer        | no   | UNIQUE, `autoincrement()` → secuencia `sales_number_seq` (R-20; saltos posibles) |
| `cash_session_id`   | uuid           | no   | FK `cash_sessions` (R-11)                                                        |
| `seller_id`         | uuid           | no   | FK `users` (R-19)                                                                |
| `seller_name`       | varchar(120)   | no   | Snapshot de `users.name` (D-04)                                                  |
| `sold_at`           | timestamptz(3) | no   | default `now()`; nunca viene del cliente                                         |
| `total`             | numeric(12,2)  | no   | `CHECK (total > 0)`                                                              |
| `client_request_id` | uuid           | no   | UNIQUE; valor de `Idempotency-Key`                                               |
| `request_hash`      | char(64)       | no   | `CHECK (request_hash ~ '^[0-9a-f]{64}$')`                                        |

- Sin `status`, `voided_*`, `subtotal`, `discount_total`, `customer_id`, `invoice_reference`,
  moneda, impuestos ni `notes`.
- Índices: `(sold_at, id)`, `(seller_id, sold_at)`, `(cash_session_id)`.
- `sales_require_open_session` (`BEFORE INSERT`): lee la sesión con `FOR SHARE`; si no existe o no
  está `OPEN`, excepción; exige `NEW.sold_at >= opened_at`.

### 3.5 `sale_items` (inmutable)

| Columna              | Tipo          | Nulo | Nota                                                                        |
| -------------------- | ------------- | ---- | --------------------------------------------------------------------------- |
| `id`                 | uuid          | no   | PK                                                                          |
| `sale_id`            | uuid          | no   | FK `sales`                                                                  |
| `variant_id`         | uuid          | no   | FK `product_variants`                                                       |
| `quantity`           | integer       | no   | `CHECK (quantity > 0)`                                                      |
| `unit_price`         | numeric(12,2) | no   | Snapshot de `sale_price` leído bajo bloqueo; `CHECK (> 0)`                  |
| `line_total`         | numeric(12,2) | no   | `CHECK (line_total = quantity * unit_price)`                                |
| `unit_cost_snapshot` | numeric(12,4) | no   | `cost_price` al vender; `CHECK (>= 0)`; **nunca** sale por la API de ventas |
| `sku`                | varchar(64)   | no   | Snapshot                                                                    |
| `product_name`       | varchar(200)  | no   | Snapshot                                                                    |
| `variant_label`      | varchar(200)  | sí   | Snapshot                                                                    |
| `movement_id`        | bigint        | no   | FK `inventory_movements(id)`, UNIQUE                                        |

- `UNIQUE (sale_id, variant_id)`; índice `(variant_id, sale_id)`.
- Declarar la relación `movement` en `schema.prisma` (si no, `migrate dev` generaría un `DROP`).

### 3.6 `sale_payments` (inmutable)

| Columna           | Tipo          | Nulo | Nota                                                                         |
| ----------------- | ------------- | ---- | ---------------------------------------------------------------------------- |
| `id`              | uuid          | no   | PK                                                                           |
| `sale_id`         | uuid          | no   | FK `sales`                                                                   |
| `method_id`       | uuid          | no   | FK compuesta `(method_id, method_is_cash)` → `payment_methods (id, is_cash)` |
| `method_is_cash`  | boolean       | no   | Copia forzada por la FK                                                      |
| `method_name`     | varchar(100)  | no   | Snapshot del nombre del medio (el comprobante no lee el catálogo vivo)       |
| `amount`          | numeric(12,2) | no   | `CHECK (amount > 0)`. **Lo aplicado a la venta** (neto de vuelto)            |
| `tendered_amount` | numeric(12,2) | sí   | Efectivo recibido; solo efectivo                                             |
| `change_given`    | numeric(12,2) | sí   | Vuelto; solo efectivo                                                        |
| `reference`       | varchar(100)  | sí   | Solo QR o transferencia (D-09)                                               |

- `CHECK ((method_is_cash) = (tendered_amount IS NOT NULL AND change_given IS NOT NULL))`.
- `CHECK (NOT method_is_cash OR (change_given >= 0 AND tendered_amount = amount + change_given))`.
- `CHECK (NOT method_is_cash OR reference IS NULL)`.
- Índices `(sale_id)`, `(method_id)`.

### 3.7 Triggers de ventas

| Trigger                                                              | Momento                                                         | Efecto                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sales_immutable`, `sale_items_immutable`, `sale_payments_immutable` | `BEFORE UPDATE OR DELETE`, por fila                             | Siempre excepción. Reutilizar `prevent_append_only_change()` (migración `20261006225940_append_only_error_code`); si su mensaje es específico del libro, crear `prevent_sale_record_change()` con el mismo `ERRCODE`. |
| `sales_integrity_check` (en `sales`, `sale_items` y `sale_payments`) | `CONSTRAINT TRIGGER AFTER INSERT DEFERRABLE INITIALLY DEFERRED` | Al `COMMIT`: la venta tiene ≥ 1 línea y ≥ 1 pago, `Σ line_total = total` y `Σ amount = total`. Cierra también el hueco «insertar líneas o pagos después» (03 §7.3).                                                   |
| `sale_items_movement_check`                                          | `CONSTRAINT TRIGGER AFTER INSERT` diferido                      | El movimiento referido es `type = 'SALE'`, misma variante, `quantity = -NEW.quantity`, `reference_type = 'SALE'`, `reference_id = NEW.sale_id`, `unit_cost = NEW.unit_cost_snapshot` (03 §7.4).                       |

`TRUNCATE` no se cubre con triggers: se resuelve con la revocación del privilegio (D3, otro agente).
Consecuencia en pruebas: no se puede insertar una `sales` suelta; siempre venta + líneas + pagos en
una `$transaction`.

Coordinación con las garantías de BD (otro agente): el CHECK de signo I-05 debe incluir
`SALE → quantity < 0`. Si la migración de garantías no lo trae, S1 agrega
`inventory_movements_sale_sign_check CHECK (type <> 'SALE' OR quantity < 0)`; si ya lo trae, no se
duplica. El índice I-02 `(reference_type, reference_id, variant_id, type)` no cambia.

### 3.8 `sale_receipt_prints` (append-only)

| Columna         | Tipo           | Nulo | Nota                                          |
| --------------- | -------------- | ---- | --------------------------------------------- |
| `id`            | uuid           | no   | PK                                            |
| `sale_id`       | uuid           | no   | FK `sales`                                    |
| `copy_number`   | integer        | no   | `CHECK (copy_number >= 1)`; 1 = original      |
| `format`        | varchar(10)    | no   | `CHECK (format IN ('58mm','80mm','A5','A4'))` |
| `printed_by_id` | uuid           | no   | FK `users`                                    |
| `printed_at`    | timestamptz(3) | no   | default `now()`                               |

`UNIQUE (sale_id, copy_number)`; trigger append-only. Registra la **solicitud** de impresión (el
servidor no puede saber si salió papel).

### 3.9 `cash_session_corrections` (append-only)

Columnas, CHECK y triggers **exactamente** como en [10 §5](10-correcciones-de-caja.md): `id`,
`cash_session_id`, `sequence` (`UNIQUE (cash_session_id, sequence)`), `kind`, `previous_value`,
`new_value`, `expected_cash_after`, `counted_cash_after`, `difference_after`, `reason`
(`length(btrim(reason)) >= 10`), `corrected_by_id`, `corrected_at`, `client_request_id` (UNIQUE),
`request_hash`. Triggers `cash_session_corrections_append_only` y
`cash_session_corrections_validate` (`BEFORE INSERT`: sesión `CLOSED`, `previous_value` = valor
vigente, cifras `*_after` recalculadas con `cash_sales_total` congelado, `sequence` = última + 1).
Sin columnas ni FK hacia ventas, pagos o medios (AE-2).

### 3.10 `sale_incidents`

| Columna             | Tipo                   | Nulo | Nota                                               |
| ------------------- | ---------------------- | ---- | -------------------------------------------------- |
| `id`                | uuid                   | no   | PK                                                 |
| `number`            | integer                | no   | UNIQUE, `autoincrement()`; se muestra `INC-000001` |
| `sale_id`           | uuid                   | sí   | FK `sales`; nulo si no se conoce la venta          |
| `kind`              | `sale_incident_kind`   | no   |                                                    |
| `description`       | varchar(1000)          | no   | `CHECK (length(btrim(description)) >= 10)`         |
| `status`            | `sale_incident_status` | no   | default `OPEN`                                     |
| `reported_by_id`    | uuid                   | no   | FK `users`                                         |
| `reported_at`       | timestamptz(3)         | no   | default `now()`                                    |
| `resolution`        | varchar(1000)          | sí   | Texto de lo resuelto **fuera del sistema**         |
| `resolved_by_id`    | uuid                   | sí   | FK `users`                                         |
| `resolved_at`       | timestamptz(3)         | sí   |                                                    |
| `client_request_id` | uuid                   | no   | UNIQUE; `Idempotency-Key` del alta                 |

- `CHECK ((status = 'CLOSED') = (resolution IS NOT NULL AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL))`.
- Trigger `sale_incidents_guard`: `DELETE` prohibido; `UPDATE` solo `OPEN → CLOSED` y solo cambian
  `status`, `resolution`, `resolved_by_id`, `resolved_at`.
- **No existen a propósito:** importes, cantidades, `variant_id`, `movement_id`, `payment_id`, tipo
  «devolución» ni ningún campo que otro módulo lea para actuar. Ningún módulo consume esta tabla.
- Índices `(status, reported_at)`, `(sale_id)`.

### 3.11 `business_settings` (registro único)

| Columna               | Tipo           | Nulo | Nota                                      |
| --------------------- | -------------- | ---- | ----------------------------------------- |
| `id`                  | smallint       | no   | PK, default `1`, `CHECK (id = 1)`         |
| `trade_name`          | varchar(120)   | no   | `CHECK (length(btrim(trade_name)) >= 1)`  |
| `address`             | varchar(200)   | sí   |                                           |
| `phone`               | varchar(40)    | sí   |                                           |
| `tax_id`              | varchar(20)    | sí   | NIT opcional (C1)                         |
| `receipt_show_seller` | boolean        | no   | default `false` (D-04)                    |
| `updated_at`          | timestamptz(3) | no   |                                           |
| `updated_by_id`       | uuid           | sí   | FK `users`; nulo hasta la primera edición |

La migración inserta la fila `(1, 'Joyería Sole', NULL, NULL, NULL, false, now(), NULL)` con
`ON CONFLICT DO NOTHING`; `seed.ts` **no** la sobrescribe. Excepción justificada a «IDs UUID v7»: no
es una entidad sino un registro único (registrar en el ADR). Sin columna de logo.

### 3.12 Orden global de bloqueos

Amplía `stock-locks.ts` (variantes por id → saldos por id de variante) anteponiendo la caja:

| Paso | Recurso                                         | Quién y cómo                                                                        |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0    | Ninguno                                         | Lectura de repetición idempotente (sin bloqueo)                                     |
| 1    | Fila de `cash_sessions`                         | Venta: `FOR SHARE` sobre la sesión `OPEN`. Cierre y corrección: `FOR UPDATE` por id |
| 2    | `product_variants` por id ascendente            | Solo la venta, con `lockVariantsAndBalances` de `stock-locks.ts`                    |
| 3    | `inventory_balances` por id de variante         | Solo la venta (misma función; `applyStockChanges` vuelve a tomarlos sin esperar)    |
| 4    | Inserciones (`sales`, líneas, pagos, auditoría) | Sin bloqueos explícitos                                                             |

Reglas:

- El cierre y la corrección **solo** bloquean la sesión; nunca variantes ni saldos. Ingresos,
  ajustes, conteos y cambios **nunca** bloquean la sesión. No hay ciclo posible.
- Las sumas del cierre son **sentencias posteriores** al `FOR UPDATE` (en `READ COMMITTED` cada
  sentencia toma su propio snapshot); nunca un CTE en la sentencia que bloquea.
- El cierre ejecuta `SET LOCAL lock_timeout = '5s'`; si vence, responde el `503` con `Retry-After`
  existente.
- Nivel de aislamiento: `READ COMMITTED` (el actual). No usar `isolationLevel`.
- `POST /sales/:id/receipt/print-events` bloquea solo la fila de `sales` (`FOR UPDATE`; bloquear no
  es modificar, el trigger no se dispara) para numerar la copia; no toma ningún otro bloqueo.
- Nueva función pública `lockOpenCashSession(tx)` en `modules/cash/cash-locks.ts`: ejecuta
  `SELECT id, number FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`; sin fila lanza
  `CASH_SESSION_REQUIRED`. `sales` la llama; **no** escribe tablas de caja.

Resultados garantizados: venta en curso antes del cierre → incluida en el esperado; venta que llega
durante o después del cierre → `422 CASH_SESSION_REQUIRED` sin efectos; doble cierre → uno cierra y
el otro recibe repetición (misma clave) o `409` (otra clave).

## 4. API

Prefijo `/api/v1`. Esquemas Zod **estrictos** (`z.strictObject`) de `body`, `querystring`, `params`
y `response` en `packages/shared/src/schemas/`; autorización en `preValidation`; respuestas
`{ data }` o `{ data, meta }`; dinero como `string` con 2 decimales; fechas ISO con `Z`.
Aritmética en centavos enteros con `parseMoney` y `formatMoney` de `@joyeria/shared`.

### 4.1 Permisos nuevos y asignación

| Permiso                    | Descripción                                      | Admin | Responsable | Vendedor | Base             |
| -------------------------- | ------------------------------------------------ | :---: | :---------: | :------: | ---------------- |
| `sales:create`             | Registrar ventas y consultar si hay caja abierta |  sí   |     sí      |    sí    | D-01             |
| `sales:read`               | Ver las ventas propias y su comprobante          |  sí   |     sí      |    sí    | D-02             |
| `sales:read-all`           | Ver todas las ventas                             |  sí   |     sí      |    no    | D-02             |
| `cash:read`                | Ver sesiones de caja, arqueos y correcciones     |  sí   |     sí      |    no    | D-13             |
| `cash:open`                | Abrir la caja                                    |  sí   |     sí      |    no    | B3 (confirmada)  |
| `cash:close`               | Cerrar la caja y registrar el arqueo             |  sí   |     sí      |    no    | B3 (confirmada)  |
| `cash:correct`             | Corregir errores de captura de un cierre         |  sí   |     no      |    no    | Aclaración B6/B7 |
| `sales-incidents:report`   | Reportar una incidencia de venta                 |  sí   |     sí      |    sí    | C6 (confirmada)  |
| `sales-incidents:manage`   | Ver, atender y cerrar incidencias                |  sí   |     no      |    no    | C6 (confirmada)  |
| `settings:manage` (existe) | Editar los datos comerciales                     |  sí   |     no      |    no    | R-27             |

- El Administrador los recibe por `ALL_PERMISSIONS`; el Responsable y el Vendedor por lista explícita
  en `DEFAULT_ROLE_PERMISSIONS`. Actualizar `PERMISSION_DESCRIPTIONS` y el comentario obsoleto
  («solo los aprueba el administrador»).
- **No existen** `sales:void`, `sales:cancel`, `sales:refund`, `sales:edit`, `cash:movement`,
  `cash:reopen` ni `cash:resolve-difference`.
- El Vendedor conserva `catalog:read` e `inventory:read` y no recibe `costs:read`.

### 4.2 Códigos de error nuevos (`packages/shared/src/api.ts`)

| Código                          | HTTP | Cuándo                                                                                                                                         |
| ------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `CASH_SESSION_REQUIRED`         | 422  | Venta sin sesión abierta (incluida la venta que llega durante o tras el cierre)                                                                |
| `CASH_SESSION_ALREADY_OPEN`     | 409  | Apertura con otra sesión `OPEN`; `details: { sessionId, number }`                                                                              |
| `CASH_SESSION_CLOSED`           | 409  | Cierre de una sesión ya cerrada con otra clave                                                                                                 |
| `CASH_SESSION_NOT_CLOSED`       | 409  | Corrección sobre una sesión `OPEN`                                                                                                             |
| `CASH_DIFFERENCE_NOTE_REQUIRED` | 422  | Cierre con diferencia ≠ 0 sin observación; `details: { expectedCash, countedCash, difference }`; **nada se guarda**                            |
| `CASH_CORRECTION_CONFLICT`      | 409  | `expectedPreviousValue` ya no es el valor vigente                                                                                              |
| `PRICE_CHANGED`                 | 409  | Precio o total esperado distinto del vigente; `details: { items: [{ variantId, expectedUnitPrice, currentUnitPrice }] }`                       |
| `INSUFFICIENT_STOCK`            | 422  | Stock insuficiente; `details: { items: [{ variantId, sku, available, requested }] }`                                                           |
| `VARIANT_NOT_SELLABLE`          | 422  | Variante o producto inactivo, o precio de venta nulo o cero                                                                                    |
| `PAYMENT_MISMATCH`              | 422  | Σ pagos ≠ total, efectivo recibido < aplicado, o medio inactivo; `details: { total, paid }`                                                    |
| `IDEMPOTENCY_KEY_CONFLICT`      | 409  | Misma clave con cuerpo distinto o de otro usuario. **Usar el código que defina el helper genérico** si ya existe uno equivalente; no duplicar. |

Se lanzan con `BusinessRuleError(message, details, code)` (422) y con `ConflictError`; si
`ConflictError` no admite código propio, ampliarlo con el mismo tercer parámetro opcional.
Cabecera `Idempotency-Key` ausente o no UUID → `400 VALIDATION_ERROR`.

### 4.3 Idempotencia

| Regla | Contenido                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1   | La clave viaja **solo** en la cabecera `Idempotency-Key` (UUID). No hay `clientRequestId` en el cuerpo (los documentos 02, 03 y 10 lo proponían en el cuerpo; lo sustituye la cabecera del helper genérico).                                                                                                                                                                                 |
| I-2   | El helper genérico valida la cabecera y calcula el hash canónico. Además, **las tablas de dominio guardan la clave** (`sales.client_request_id`, `cash_sessions.open_request_id` y `close_request_id`, `cash_session_corrections.client_request_id`, `sale_incidents.client_request_id`) con índice único: es la garantía de BD y debe escribirse en la **misma transacción** que el efecto. |
| I-3   | Misma clave, mismo cuerpo y mismo usuario → misma respuesta (`200`), en cualquier momento. Misma clave con otro cuerpo u otro usuario → `409`.                                                                                                                                                                                                                                               |
| I-4   | El hash de la venta **no** incluye la sesión de caja, la hora ni el usuario.                                                                                                                                                                                                                                                                                                                 |
| I-5   | La repetición se evalúa **antes** de exigir sesión abierta, y **otra vez** antes de responder cualquier error de la transacción (si la venta ya existe con el mismo hash, se responde la repetición).                                                                                                                                                                                        |
| I-6   | El agente de backend lee primero el helper real; si su contrato impide I-2 o I-5, se detiene y lo informa antes de S2.                                                                                                                                                                                                                                                                       |

### 4.4 Caja (`modules/cash`)

| #   | Ruta                                  | Permiso                                   | `Idempotency-Key` | Cuerpo o consulta                                                                           | Respuesta                                    | Errores propios                                                       |
| --- | ------------------------------------- | ----------------------------------------- | :---------------: | ------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| C1  | `GET /cash/status`                    | cualquiera de `sales:create`, `cash:read` |        no         | —                                                                                           | `200 { open, session }` sin cifras           | —                                                                     |
| C2  | `POST /cash/sessions`                 | `cash:open`                               |      **sí**       | `{ openingAmount }`                                                                         | `201 sessionDetail` (`200` si es repetición) | `409 CASH_SESSION_ALREADY_OPEN`                                       |
| C3  | `GET /cash/sessions/current`          | `cash:read`                               |        no         | —                                                                                           | `200 sessionDetail` con cifras en vivo       | `404` sin sesión abierta                                              |
| C4  | `GET /cash/sessions`                  | `cash:read`                               |        no         | `page`, `pageSize` ≤ 100, `status` (`all`, `OPEN`, `CLOSED`), `from`, `to` (días de La Paz) | `200 { data: [sessionSummary], meta }`       | —                                                                     |
| C5  | `GET /cash/sessions/:id`              | `cash:read`                               |        no         | —                                                                                           | `200 sessionDetail`                          | `404`                                                                 |
| C6  | `POST /cash/sessions/:id/close`       | `cash:close`                              |      **sí**       | `{ countedCash, notes? }` (`notes` ≤ 500)                                                   | `200 sessionDetail`                          | `404`; `409 CASH_SESSION_CLOSED`; `422 CASH_DIFFERENCE_NOTE_REQUIRED` |
| C7  | `POST /cash/sessions/:id/corrections` | `cash:correct`                            |      **sí**       | `{ kind, expectedPreviousValue?, newValue?, reason }`                                       | `201 { correction, session }`                | `404`; `409 CASH_SESSION_NOT_CLOSED`; `409 CASH_CORRECTION_CONFLICT`  |
| C8  | `GET /cash/sessions/:id/corrections`  | `cash:read`                               |        no         | —                                                                                           | `200 { data: [correction] }` por `sequence`  | `404`                                                                 |

- `session` en C1: `{ id, number, openedAt, openedByName }` o `null`.
- `sessionDetail`: `id`, `number`, `status`, `openedAt`, `openedBy { id, name }`, `openingAmount`,
  `closedAt`, `closedBy`, `expectedCash`, `countedCash`, `difference`, `notes`, `liveExpectedCash`
  (solo `OPEN`), `totalsByMethod [{ methodCode, methodName, isCash, amount, paymentsCount }]`,
  `salesCount`, `salesTotal`, `mixedSales { count, amount }`, `current { openingAmount, expectedCash, countedCash, difference }`
  (cifras vigentes tras correcciones) y `corrections { count, lastAt }`.
- El cuerpo de C6 **no** admite `expectedCash`; el de C7 rechaza `saleId`, `paymentId`, `methodId`,
  `expectedCash`, `cashSalesTotal` (Zod estricto → `400`).
- `openingAmount` y `countedCash`: `string` decimal ≥ 0 con hasta 2 decimales.
- Algoritmo del cierre: repetición por `close_request_id` → `BEGIN` → `lock_timeout` → `FOR UPDATE`
  por id → si `CLOSED`: repetición (`200`) o `409` → sumas en sentencias separadas → `difference` →
  si ≠ 0 y sin `notes` (≥ 3 caracteres): `422` → `UPDATE` → `recordAudit` → `COMMIT`.
- La violación del índice único parcial (`P2002`) se captura y se traduce a
  `CASH_SESSION_ALREADY_OPEN`.
- **No existen** `PATCH`, `PUT` ni `DELETE` sobre sesiones o correcciones, ni reapertura, ni
  movimientos.
- Auditoría: `cash_session.opened`, `cash_session.closed` (con `before` y `after`),
  `cash_session.corrected`.

### 4.5 Ventas (`modules/sales`)

| #   | Ruta                                   | Permiso                                      | `Idempotency-Key` | Cuerpo o consulta                                                                               | Respuesta                                                            | Errores propios                                                                                                                                    |
| --- | -------------------------------------- | -------------------------------------------- | :---------------: | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `GET /payment-methods`                 | `sales:create`                               |        no         | —                                                                                               | `200 { data: [{ code, name, isCash }] }` (activos, por `sort_order`) | —                                                                                                                                                  |
| V2  | `POST /sales`                          | `sales:create`                               |      **sí**       | `{ items, payments, expectedTotal }`                                                            | `201 saleDetail` (`200` si es repetición)                            | `409 PRICE_CHANGED`; `409 IDEMPOTENCY_KEY_CONFLICT`; `422 CASH_SESSION_REQUIRED`, `INSUFFICIENT_STOCK`, `VARIANT_NOT_SELLABLE`, `PAYMENT_MISMATCH` |
| V3  | `GET /sales`                           | cualquiera de `sales:read`, `sales:read-all` |        no         | `page`, `pageSize` ≤ 100, `from`, `to`, `number?`, `sellerId?`, `cashSessionId?`, `methodCode?` | `200 { data: [saleSummary], meta }` por `soldAt desc`                | —                                                                                                                                                  |
| V4  | `GET /sales/:id`                       | cualquiera de `sales:read`, `sales:read-all` |        no         | —                                                                                               | `200 saleDetail`                                                     | `404` (inexistente **o** ajena sin `sales:read-all`)                                                                                               |
| V5  | `GET /sales/:id/receipt`               | igual que V4                                 |        no         | —                                                                                               | `200 receipt`                                                        | `404`                                                                                                                                              |
| V6  | `POST /sales/:id/receipt/print-events` | igual que V4                                 |        no         | `{ format }` (`58mm`, `80mm`, `A5`, `A4`)                                                       | `201 { copyNumber, isCopy, printedAt }`                              | `404`                                                                                                                                              |

Cuerpo de V2:

- `items`: 1 a 50 de `{ variantId, quantity (1..999), expectedUnitPrice }`; `variantId` sin repetir.
- `payments`: 1 a 3 de `{ methodCode, amount, tendered?, reference? }`; `methodCode` sin repetir;
  `tendered` obligatorio y solo permitido en efectivo; `reference` solo en QR o transferencia.
- `expectedTotal`: `string`.

Algoritmo de V2 (una sola `prisma.$transaction`):

1. Repetición: buscar `sales` por `client_request_id`; si existe, comparar hash y `seller_id`
   (`200` o `409`).
2. `lockOpenCashSession(tx)` → `422 CASH_SESSION_REQUIRED` si no hay fila.
3. `lockVariantsAndBalances(tx, variantIds)`.
4. Repetición bajo bloqueo (dos envíos simultáneos de la misma venta se serializan por sus variantes).
5. Leer variantes, productos y saldos. Validar: existen, variante y producto `ACTIVE`,
   `sale_price > 0`, `expectedUnitPrice = sale_price`, `expectedTotal = Σ quantity × sale_price`,
   saldo ≥ cantidad.
6. Validar pagos: medios activos; importes > 0; `Σ amount = total`; en efectivo `tendered ≥ amount`
   y `change = tendered − amount`.
7. `applyStockChanges(tx, changes, { requireActive: true })` con `type: 'SALE'`, `quantity`
   negativa, `unitCost = cost_price`, `referenceType: REFERENCE_TYPES.SALE`, `referenceId: saleId`,
   `userId`, `label: sku`. Importar desde `modules/inventory/stock-ledger.ts` (mismo patrón que
   `exchanges.service.ts`); **el módulo `sales` no escribe el libro por otra vía**.
8. `INSERT sales` → `sale_items` (con `movementId`) → `sale_payments` → `recordAudit(tx, 'sale.created')`.
9. `COMMIT` (corren los triggers diferidos).
10. Ante **cualquier** error (incluido `P2002` sobre `client_request_id`), repetir la búsqueda del
    paso 1 antes de responder.

> Ajuste respecto de [03 §8.1](03-modelo-de-datos-ventas-y-caja.md): allí `INSERT sales` ocurre antes
> de bloquear variantes. Como `total` es `NOT NULL` e inmutable y depende de precios leídos bajo
> bloqueo, aquí la inserción va **después** del libro. La idempotencia la cubren los pasos 1, 4 y 10
> y el índice único. Los números consumidos por intentos revertidos son saltos aceptados (R-20).

Respuestas:

- `saleSummary`: `id`, `number`, `soldAt`, `sellerName`, `total`, `itemsCount`, `paymentMethods [code]`,
  `cashSessionNumber`.
- `saleDetail`: lo anterior más `items [{ variantId, sku, productName, variantLabel, quantity, unitPrice, lineTotal }]`,
  `payments [{ methodCode, methodName, amount, tendered, changeGiven, reference }]` y
  `receiptPrints` (cantidad).
- `receipt`: `saleId`, `number`, `soldAt`, `currency: 'BOB'`, `items`, `total`,
  `payments [{ methodName, amount, tendered, changeGiven }]` (sin `reference`, D-09),
  `seller { name }` o `null` según `receipt_show_seller`,
  `business { tradeName, address, phone, taxId }`, `printCount`.
- **Ninguna respuesta de ventas contiene costos, para ningún rol** (`unit_cost_snapshot` no está en
  ningún esquema de respuesta).
- V6: `SELECT id FROM sales WHERE id = $1 FOR UPDATE`, `copy_number = MAX + 1`, `INSERT`,
  `recordAudit(tx, 'sale.receipt_printed', { format, copyNumber })`. No escribe `sales`.
- **No existen** `PATCH`, `PUT` ni `DELETE` bajo `/sales`, ni rutas `void`, `cancel`, `refund`,
  `reverse`, `return`.

### 4.6 Incidencias (`modules/sales/incidents.*`) y configuración (`modules/settings`)

| #   | Ruta                             | Permiso                  | `Idempotency-Key` | Cuerpo o consulta                                                     | Respuesta                        | Errores propios                          |
| --- | -------------------------------- | ------------------------ | :---------------: | --------------------------------------------------------------------- | -------------------------------- | ---------------------------------------- |
| N1  | `POST /sale-incidents`           | `sales-incidents:report` |      **sí**       | `{ kind, description (10..1000), saleNumber? }`                       | `201 incident`                   | `404` si `saleNumber` no existe          |
| N2  | `GET /sale-incidents`            | `sales-incidents:manage` |        no         | `page`, `pageSize`, `status` (`all`, `OPEN`, `CLOSED`), `from`, `to`  | `200 { data: [incident], meta }` | —                                        |
| N3  | `GET /sale-incidents/:id`        | `sales-incidents:manage` |        no         | —                                                                     | `200 incident`                   | `404`                                    |
| N4  | `POST /sale-incidents/:id/close` | `sales-incidents:manage` |        no         | `{ resolution (10..1000) }`                                           | `200 incident`                   | `404`; `409 CONFLICT` si ya está cerrada |
| S1  | `GET /settings/business`         | `settings:manage`        |        no         | —                                                                     | `200 businessSettings`           | —                                        |
| S2  | `PUT /settings/business`         | `settings:manage`        |        no         | `{ tradeName (1..120), address?, phone?, taxId?, receiptShowSeller }` | `200 businessSettings`           | —                                        |

- `incident`: `id`, `number`, `kind`, `description`, `status`, `sale { id, number }` o `null`,
  `reportedBy { id, name }`, `reportedAt`, `resolution`, `resolvedBy`, `resolvedAt`.
- N1 con `saleNumber`: quien no tiene `sales:read-all` solo puede referenciar ventas propias; una
  venta ajena responde `404` (no revela existencia).
- Zod estricto: N1 y N4 rechazan `amount`, `quantity`, `variantId`, `refund` y cualquier clave extra.
- Los servicios de incidencias **no importan** `modules/inventory` ni `modules/cash` ni escriben
  ventas; solo `sale_incidents` y auditoría (`sale_incident.reported`, `sale_incident.closed`).
- S2 audita `business_settings.updated` con `before` y `after`. Los datos comerciales llegan al resto
  de roles solo dentro de `receipt`.

### 4.7 Registro en `app.ts`

`/cash` → `cashRoutes`; `/sales` → `salesRoutes`; `/payment-methods` → `paymentMethodsRoutes`;
`/sale-incidents` → `saleIncidentsRoutes`; `/settings` → `businessSettingsRoutes`.

## 5. Frontend

### 5.1 Rutas y páginas

| Ruta                      | Página (archivo en `apps/web/src/features/`) | Guarda (`lazyPage`)                            |
| ------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `/caja`                   | `cash/cash-page.tsx`                         | `anyPermissions: [cash:read, sales:create]`    |
| `/caja/cierre`            | `cash/cash-close-page.tsx`                   | `permissions: [cash:close, cash:read]`         |
| `/caja/historial`         | `cash/cash-history-page.tsx`                 | `permissions: [cash:read]`                     |
| `/caja/sesiones/:id`      | `cash/cash-session-page.tsx`                 | `permissions: [cash:read]`                     |
| `/ventas/nueva`           | `sales/pos-page.tsx`                         | `permissions: [sales:create]`                  |
| `/ventas`                 | `sales/sales-page.tsx`                       | `anyPermissions: [sales:read, sales:read-all]` |
| `/ventas/:id`             | `sales/sale-page.tsx`                        | igual                                          |
| `/ventas/:id/comprobante` | `sales/receipt-page.tsx`                     | igual                                          |
| `/ventas/incidencias`     | `sales/incidents-page.tsx`                   | `permissions: [sales-incidents:manage]`        |
| `/configuracion/negocio`  | `settings/business-settings-page.tsx`        | `permissions: [settings:manage]`               |

En `router.tsx`, `/ventas/nueva` y `/ventas/incidencias` se declaran **antes** de `/ventas/:id`.

### 5.2 Navegación (grupo «Ventas» de `GROUPS`)

| Entrada             | Ruta                     | Permiso                                              |
| ------------------- | ------------------------ | ---------------------------------------------------- |
| Punto de venta      | `/ventas/nueva`          | `sales:create`                                       |
| Historial de ventas | `/ventas`                | `sales:read`                                         |
| Caja                | `/caja`                  | `cash:read`                                          |
| Incidencias         | `/ventas/incidencias`    | `sales-incidents:manage`                             |
| Datos del negocio   | `/configuracion/negocio` | `settings:manage` (grupo de configuración existente) |

Se **elimina** la entrada «Devoluciones» («Próximamente»): no hay devoluciones (ADR-019, C9) ni
anulaciones (DEC-V07). El grupo «Ventas» sube por encima de «Acceso».

### 5.3 Componentes y utilidades

| Archivo                                       | Contenido                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `features/cash/use-cash.ts`                   | Hooks TanStack Query: estado, sesión actual, historial, detalle, abrir, cerrar, corregir                                                   |
| `features/cash/open-cash-dialog.tsx`          | Campo «Fondo inicial (Bs)» obligatorio (coma o punto; vacío no es cero)                                                                    |
| `features/cash/correction-dialog.tsx`         | Tipo, valor actual (solo lectura), valor nuevo, motivo ≥ 10 caracteres, vista previa de esperado y diferencia                              |
| `features/cash/cash-figures.tsx`              | Cifras originales y vigentes, marca «Corregida (N)», texto «sobrante» o «faltante» (nunca solo color)                                      |
| `features/sales/use-sales.ts`                 | Hooks: medios de pago, crear venta, listado, detalle, comprobante, evento de impresión, incidencias                                        |
| `features/sales/cart.ts` (+ test)             | Lógica pura del carrito: sumar línea, cambiar cantidad, quitar, total en centavos, persistencia en `sessionStorage` (`joyeria.pos.cart`)   |
| `features/sales/payments.ts` (+ test)         | Lógica pura: restante, vuelto, validación Σ pagos = total                                                                                  |
| `features/sales/scan-input.tsx`               | Campo de código con foco permanente; Enter dispara `GET /catalog/variants/lookup?code=`                                                    |
| `features/sales/review-step.tsx`              | Pantalla de revisión previa (DEC-V07)                                                                                                      |
| `features/sales/receipt.tsx`                  | Componente único del comprobante (vista previa e impresión)                                                                                |
| `features/sales/receipt-settings.ts` (+ test) | `receiptPrintCss(format)`, `loadReceiptFormat`, `saveReceiptFormat` (`localStorage`, clave `joyeria.receiptFormat`, Zod, por defecto `A4`) |
| `features/sales/report-incident-dialog.tsx`   | Alta de incidencia desde el detalle de una venta                                                                                           |
| `features/audit/audit-labels.ts`              | Etiquetas de las acciones nuevas                                                                                                           |

Constantes en `packages/shared/src/sales.ts`: `RECEIPT_TITLE = 'Comprobante interno'`,
`RECEIPT_NOT_FISCAL_LEGEND = 'No válido como factura fiscal'`, `RECEIPT_COPY_LEGEND = 'COPIA'`,
`RECEIPT_FORMATS`, `formatSaleNumber`, `formatCashSessionNumber`, `formatIncidentNumber`,
`SALE_MAX_ITEMS = 50`, `SALE_MAX_QUANTITY = 999`.

### 5.4 Flujo del POS (`/ventas/nueva`)

| Paso | Qué ocurre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `GET /cash/status`. Sin caja abierta: aviso «No hay caja abierta. No se puede vender.» y enlace a `/caja` (botón «Abrir caja» solo con `cash:open`). El carrito no se pierde.                                                                                                                                                                                                                                                                                                                                                                      |
| 1    | **Carrito.** Foco en el campo de código. Lector = teclado + Enter. Código encontrado: agrega la línea o suma 1 a la existente. No encontrado, inactivo, sin precio o sin stock: mensaje con `role="alert"`, sin agregar. Alternativa: buscar por nombre o SKU.                                                                                                                                                                                                                                                                                     |
| 2    | Cada línea muestra **foto junto al nombre**, SKU, variante, precio unitario, cantidad editable (tope: stock disponible), subtotal y «Quitar». Total siempre visible. Nunca costos.                                                                                                                                                                                                                                                                                                                                                                 |
| 3    | **Cobro.** Tres campos: Efectivo recibido, QR, Transferencia (con referencia opcional). El sistema muestra «Falta», «Vuelto» y habilita «Revisar» solo si lo aplicado iguala el total. El vuelto solo sale del efectivo; QR y transferencia no pueden exceder el total.                                                                                                                                                                                                                                                                            |
| 4    | **Revisión previa (obligatoria).** Pantalla de solo lectura con cada línea (foto, nombre, SKU, variante, cantidad, precio, subtotal), total, desglose de pagos, recibido y vuelto, y el aviso: «Una venta confirmada no se puede anular ni modificar. Revise las piezas y los importes antes de confirmar.» Botones «Volver a corregir» y «Confirmar venta».                                                                                                                                                                                       |
| 5    | **Confirmar.** Se genera un UUID de idempotencia al entrar a la revisión y se guarda en `sessionStorage` junto al carrito. Botón deshabilitado mientras la petición está en vuelo. `POST /sales` con `Idempotency-Key`.                                                                                                                                                                                                                                                                                                                            |
| 6    | **Resultados.** `201` o `200`: pantalla «Venta VTA-000123 registrada» con total y vuelto, botones «Ver comprobante» y «Nueva venta»; se borran carrito y clave. `409 PRICE_CHANGED` o `422 INSUFFICIENT_STOCK` o `VARIANT_NOT_SELLABLE`: vuelve al carrito con las líneas marcadas y **clave nueva**. `422 CASH_SESSION_REQUIRED`: «La caja se cerró mientras cobraba…», carrito y clave conservados. Error de red o `503`: estado «Resultado incierto: no cobre de nuevo», botón «Reintentar» con la **misma clave** y enlace a «Ventas del día». |
| 7    | Si cambia el carrito tras un intento fallido de negocio, se genera una clave nueva; tras un fallo de red, no.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Verificar en S6 que `variantLookupSchema` trae `salePrice`, stock disponible, estado y foto, y que
no trae costos sin `costs:read`; si falta un campo, ampliar el esquema sin costos.

### 5.5 Caja

- `/caja`: cerrada → aviso y «Abrir caja»; abierta → quién y desde cuándo, fondo, cantidad de
  ventas, totales por medio, ventas mixtas, efectivo esperado en vivo (solo `cash:read`) y «Cerrar
  caja» (solo `cash:close`). Quien solo tiene `sales:create` ve el estado sin cifras.
- `/caja/cierre`: (1) «Efectivo contado (Bs)»; (2) resumen: contado, esperado, diferencia anunciada
  por `aria-live`, QR y transferencia «informados aparte, no forman parte del efectivo», observación
  (obligatoria si la diferencia no es cero); (3) diálogo accesible de confirmación «El cierre no se
  puede reabrir» (sin `window.confirm`). Si el servidor responde
  `CASH_DIFFERENCE_NOTE_REQUIRED`, se actualizan las cifras y se pide la observación. Misma clave de
  idempotencia en los reintentos de red; clave nueva si cambia el contado o la observación.
- `/caja/historial` y `/caja/sesiones/:id`: tabla paginada y detalle con cifras originales y
  vigentes, lista de correcciones y «Corregir cierre» (solo `cash:correct`, solo `CLOSED`).

### 5.6 Comprobante e impresión

- `receipt-page.tsx`: selector (`fieldset` + radios) 58 mm, 80 mm, A5, A4; vista previa con el
  **mismo componente** al ancho real en mm; botón «Imprimir comprobante de la venta VTA-…»; ayuda
  «Use escala 100 % y desactive encabezados y pies de página».
- Impresión: portal `#print-receipt` hijo de `<body>` con `<style>` propio (mismo patrón que
  `labelPrintCss` y `LabelPrintArea` de `features/catalog`): en pantalla se oculta; en
  `@media print` se oculta `body > #root` y se muestra el portal.
- `@page` por formato: `58mm auto; margin: 0` (contenido 48 mm), `80mm auto; margin: 0` (72 mm),
  `A5; margin: 10mm`, `A4; margin: 15mm`. Fuentes del sistema, `tabular-nums`, negro sobre blanco,
  `thead { display: table-header-group }`, `tr { break-inside: avoid }`. Sin dependencias nuevas.
- Al pulsar «Imprimir»: `POST .../print-events` → con la respuesta se pinta «COPIA» si `isCopy` →
  `window.print()`. Si el `POST` falla, **no se imprime** y se muestra el error (toda impresión queda
  auditada).
- No hay impresión automática tras la venta. El comprobante no muestra costos, referencia de pago ni
  hora de impresión.

### 5.7 Historial e incidencias

- `/ventas`: filtros por fecha (por defecto hoy, La Paz), número, vendedor (solo `sales:read-all`) y
  medio; columnas número, fecha y hora, vendedor, total, medios.
- `/ventas/:id`: detalle de solo lectura; acciones «Ver comprobante» y «Reportar incidencia» (con
  `sales-incidents:report`). **Ningún botón de anular, editar, devolver o eliminar.**
- `/ventas/incidencias` (Administrador): lista, detalle y «Cerrar incidencia» con resolución
  obligatoria. Texto fijo: «La incidencia no modifica la venta, el stock ni la caja.»

Todos los textos en español; `label` asociados, foco visible, `role="status"` y `role="alert"`,
objetivos táctiles `min-h-10`; rutas nuevas añadidas a `responsive.spec.ts`.

## 6. Pruebas obligatorias

### 6.1 Unitarias

| Archivo                                                                     | Casos                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/unit/sale-math.test.ts`                                      | Total en centavos; vuelto; Σ pagos ≠ total; efectivo recibido < aplicado; `tendered` en medio no efectivo; hash canónico estable ante reordenamiento de claves                               |
| `apps/api/test/unit/cash-math.test.ts`                                      | Esperado = fondo + efectivo (con vuelto); diferencia con signo; cifras vigentes tras una cadena de correcciones (ejemplo de 10 §4.2)                                                         |
| `packages/shared` (permisos)                                                | Solo `ADMIN` tiene `cash:correct` y `sales-incidents:manage`; `SELLER` no tiene `cash:*`, `costs:read` ni `sales:read-all`; `INVENTORY_MANAGER` tiene `cash:open`, `cash:close`, `cash:read` |
| `apps/api/test/unit/no-sale-void-guard.test.ts`                             | **Guarda estática** (§6.4)                                                                                                                                                                   |
| `apps/web` (`cart.test.ts`, `payments.test.ts`, `receipt-settings.test.ts`) | Carrito; vuelto y restante; `receiptPrintCss` por formato; formato inválido o `localStorage` corrupto → `A4`                                                                                 |

### 6.2 Integración (BD real; `buildTestApp`, `login`, `createTestUser`, `resetDatabase`)

| Archivo                      | Casos concretos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash.test.ts`               | 401, 403 por permiso (Vendedor no abre ni cierra; solo recibe C1 sin cifras), 400 (negativo, vacío, clave extra `expectedCash`), `PASSWORD_CHANGE_REQUIRED`; apertura con `"0"`; segunda apertura `409`; cierre sin diferencia; cierre con diferencia sin nota → `422` y la sesión sigue `OPEN`; con nota → `CLOSED`; ejemplo de 02 §6 (sin gastos): cifras exactas; auditoría de apertura y cierre; sin rutas `PATCH`, `PUT`, `DELETE` ni reapertura                                                                                                                                                                                                          |
| `cash-concurrency.test.ts`   | **Doble apertura** simultánea con claves distintas: una `201`, otra `409`; misma clave: misma sesión. **Doble cierre** con la misma clave: un cierre y respuestas idénticas; con claves distintas: uno cierra, otro `409`, cifras del primero. **Venta durante el cierre**: venta con compuerta que retiene `FOR SHARE`; el cierre no termina hasta liberarla y la incluye; venta posterior → `422` sin stock, pagos ni auditoría. Mutante: sin `FOR SHARE` o `FOR UPDATE` las pruebas fallan                                                                                                                                                                  |
| `cash-corrections.test.ts`   | Todos los casos de [10 §12](10-correcciones-de-caja.md): Responsable y Vendedor `403`; tipos y claves prohibidos `400`; sesión `OPEN` `409`; conflicto de valor anterior `409`; `cash_sessions`, ventas y libro idénticos tras corregir; dos correcciones simultáneas                                                                                                                                                                                                                                                                                                                                                                                          |
| `sales.test.ts`              | 401, 403, 400 (sin `Idempotency-Key`, clave extra, cantidad 0, variante repetida, `tendered` en QR); caso feliz efectivo con vuelto; QR; transferencia; **mixto**; **pago que no cuadra** (falta, sobra, QR mayor que el total) → `422 PAYMENT_MISMATCH` sin efectos; sin sesión → `422`; sin stock → `422 INSUFFICIENT_STOCK`; variante inactiva o precio 0 → `422`; precio cambiado → `409 PRICE_CHANGED`; movimiento `SALE` negativo con `reference_type = 'SALE'`; `sale_items.movement_id` correcto; auditoría `sale.created`; **ninguna respuesta contiene claves `cost`** (Vendedor, Responsable y Administrador); Vendedor no ve ventas ajenas (`404`) |
| `sales-idempotency.test.ts`  | **Reintento idempotente**: misma clave y cuerpo → una venta, un descuento de stock, misma respuesta; cuerpo distinto → `409`; otro usuario → `409`; `Promise.all` de dos envíos idénticos → una venta; reintento **después de cerrar la caja** de una venta ya confirmada → `200` (no `422`); fallo simulado a mitad de transacción → nada persiste y el reintento crea la venta                                                                                                                                                                                                                                                                               |
| `sales-concurrency.test.ts`  | **Dos ventas por la última pieza** (claves distintas, `Promise.all`): una `201`, otra `422`; saldo final 0; un solo movimiento. N ventas simultáneas de piezas distintas: todas `201`. Venta simultánea con ajuste o ingreso de la misma variante: sin interbloqueo y libro coherente. Mutante: sin bloqueo de variantes la prueba falla                                                                                                                                                                                                                                                                                                                       |
| `sales-immutability.test.ts` | `UPDATE` y `DELETE` directos sobre `sales`, `sale_items`, `sale_payments`, `sale_receipt_prints` fallan; insertar una línea o un pago extra en una venta confirmada falla al `COMMIT`; venta sin líneas o sin pagos falla; `sales` con sesión `CLOSED` falla; segunda sesión `OPEN` por SQL falla; `UPDATE` de sesión `CLOSED` falla; `expected_cash` falso en el cierre falla                                                                                                                                                                                                                                                                                 |
| `sales-receipt.test.ts`      | `receipt` = datos guardados; cambiar precio, nombre de producto, etiqueta de variante y nombre del medio **después** de vender no cambia el comprobante; `GET` no escribe nada; primer evento `copyNumber 1`, `isCopy false`; segundo `isCopy true`; auditoría `sale.receipt_printed`; dos eventos simultáneos → números distintos; `seller` según `receipt_show_seller`; sin costos                                                                                                                                                                                                                                                                           |
| `sale-incidents.test.ts`     | Vendedor y Responsable reportan (`201`) y **no** listan (`403`); Administrador lista y cierra; cierre doble `409`; claves prohibidas `400`; **tras reportar y cerrar: recuento y contenido de `sales`, `sale_items`, `sale_payments`, `inventory_movements`, `inventory_balances` y `cash_sessions` idénticos**; `UPDATE` de una incidencia cerrada y `DELETE` fallan                                                                                                                                                                                                                                                                                          |
| `business-settings.test.ts`  | Solo Administrador (`403` para los demás); fila sembrada; `PUT` valida y audita; el comprobante refleja el cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 6.3 Invariantes (ampliar `ledger-invariant.test.ts` y crear `sales-invariant.test.ts`)

Tras una secuencia mixta (ingresos, ventas concurrentes, cierres, correcciones, incidencias):

| Invariante                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- |
| Para toda variante: `inventory_balances.quantity = Σ inventory_movements.quantity` y coincide con el último `balance_after`        |
| Para toda venta: `Σ sale_items.line_total = total = Σ sale_payments.amount`                                                        |
| Para toda venta: un movimiento `SALE` por línea, con `quantity = -sale_items.quantity`; ninguna venta sin movimientos ni viceversa |
| Para toda sesión cerrada: `expected_cash = opening_amount + Σ pagos en efectivo de sus ventas` (recalculado = congelado)           |
| Para toda sesión: Σ `totalsByMethod.amount` = Σ `sales.total` de la sesión                                                         |
| Como máximo una sesión `OPEN`; ninguna venta con sesión nula o con `sold_at` anterior a la apertura                                |
| `sales.number` y `sales.client_request_id` sin duplicados                                                                          |

### 6.4 Guarda estática contra la anulación

`apps/api/test/unit/no-sale-void-guard.test.ts` recorre `apps/api/src/**`,
`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`, `packages/shared/src/**` y
`apps/web/src/**` (excluye `node_modules`, `generated/`, `dist/` y el propio archivo) y **falla** si
encuentra:

| Patrón (regex)                                                                  | Qué detecta                       |
| ------------------------------------------------------------------------------- | --------------------------------- |
| `SALE_VOID`                                                                     | Movimiento prohibido              |
| `\bVOIDED\b`                                                                    | Estado prohibido                  |
| `sales:(void\|cancel\|refund\|reverse\|edit)`                                   | Permisos prohibidos               |
| `['"\x60/]void['"\x60/]` y `/void\b`                                            | Segmento de ruta o literal `void` |
| `\bvoid(ed)?_(at\|by\|by_id\|reason)\b` y `\bvoid(ed)?(At\|By\|ById\|Reason)\b` | Columnas y campos de anulación    |
| `\b(void\|cancel\|refund\|reverse\|annul)Sale\b` (sin distinguir mayúsculas)    | Funciones de reversión            |
| `Anular venta\|Anulación de venta\|Devolver venta`                              | Textos de interfaz                |

La palabra reservada `void` de TypeScript (`: void`, `Promise<void>`, `void fn()`) **no** coincide
con estos patrones. Comprobaciones dinámicas en el mismo archivo o en `sales.test.ts`:

- `Object.values(PERMISSIONS)` no contiene ningún permiso que cumpla el patrón.
- El enum `MovementType` generado es exactamente el conjunto actual (cualquier valor nuevo obliga a
  revisar la prueba).
- La tabla de rutas de la aplicación no tiene `PATCH`, `PUT` ni `DELETE` bajo `/sales`, `/cash` ni
  `/sale-incidents`, ni rutas que contengan `void`, `cancel`, `refund`, `reverse` o `reopen`.
- `sales` no tiene columna `status`.

### 6.5 Componentes y E2E (Playwright)

| Archivo                                                                        | Rol           | Escenario                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pruebas de componentes                                                         | —             | Doble clic en «Confirmar venta» y en «Cerrar caja» envía una sola petición; revisión muestra el aviso de no anulación; sin botón de anular en el detalle; diálogo de cierre; `aria-live` de la diferencia                                                    |
| `apps/web/e2e/sales-seller.spec.ts`                                            | Vendedor      | Sin caja abierta no puede vender y no ve «Abrir caja»; con caja abierta: escanea (teclado + Enter), pago mixto, revisión, confirma, ve el comprobante; no ve costos, `/caja/historial`, `/ventas/incidencias` ni ventas ajenas; reporta una incidencia       |
| `apps/web/e2e/cash-manager.spec.ts` (implementado en `sales-cashier.spec.ts`)  | Responsable   | Abre la caja con fondo; vende; cierra con una diferencia conocida y observación; ve el historial; **no** ve «Corregir cierre» ni la lista de incidencias                                                                                                     |
| `apps/web/e2e/sales-admin.spec.ts`                                             | Administrador | Edita los datos del negocio y los ve en el comprobante; corrige el cierre y ve «Corregida (1)» con ambas cifras; atiende y cierra la incidencia; el stock y la venta no cambian                                                                              |
| `apps/web/e2e/receipt-print.spec.ts` (implementado en `sales-cashier.spec.ts`) | Vendedor      | `window.print` sustituido por un contador; `emulateMedia({ media: 'print' })`: `#root` oculto y `#print-receipt` visible; `@page` del formato elegido; formato recordado tras recargar; segunda impresión muestra «COPIA»; imprimir no llama a `POST /sales` |
| `responsive.spec.ts`                                                           | —             | Rutas nuevas sin desbordes                                                                                                                                                                                                                                   |

Datos propios por prueba (sin compartir DEMO); `npm run qa -- e2e`.

## 7. Rebanadas de entrega

Orden estricto S0 → S8. Cada rebanada termina con `npm run check` y `npm run qa -- api` en verde.

| ID  | Contenido                                    | Agente                      | Archivos que toca                                                                                                                                                                                                                                                                                                                                                              | Criterio de terminado                                                                                                                                                             |
| --- | -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0  | Registro y ADR                               | arquitectura, documentación | `docs/business/RESOLUCIONES-2026-11-10.md`, `docs/business/PENDIENTES.md` (D-01 a D-19 y X-1 a X-6), `docs/decisions/ADR-*` (§10) e índice; `CLAUDE.md` (solo el responsable)                                                                                                                                                                                                  | Autorización escrita en el repositorio; ADR aceptados; valores por defecto registrados como pendientes                                                                            |
| S1  | Esquema, seed y permisos                     | database, backend           | `apps/api/prisma/schema.prisma`; migración nueva `*_sales_and_cash` (con SQL adicional); `apps/api/prisma/seed.ts`; `packages/shared/src/permissions.ts`, `api.ts`, `reference-types.ts`, `sales.ts`, `index.ts`; `docs/database/DATABASE.md`; `sales-immutability.test.ts`, prueba de permisos, `no-sale-void-guard.test.ts`                                                  | Migración aplica en BD limpia y sobre la actual; seed idempotente (dos ejecuciones); triggers e índice parcial probados por SQL directo; guarda estática en verde                 |
| S2  | Caja API                                     | backend, testing            | `apps/api/src/modules/cash/` (`cash.routes.ts`, `cash.service.ts`, `cash-math.ts`, `cash-locks.ts`); `packages/shared/src/schemas/cash.ts`; `apps/api/src/app.ts`; `cash.test.ts`, `cash-concurrency.test.ts` (parte sin ventas), `cash-corrections.test.ts`, `cash-math.test.ts`; `docs/api/API.md`                                                                           | C1 a C8 con sus pruebas; doble apertura y doble cierre en verde con mutante                                                                                                       |
| S3  | Venta API                                    | backend, testing            | `apps/api/src/modules/sales/` (`sales.routes.ts`, `sales.service.ts`, `sale-math.ts`, `payment-methods.routes.ts`); `packages/shared/src/schemas/sales.ts`; `app.ts`; `sales.test.ts`, `sales-idempotency.test.ts`, `sales-concurrency.test.ts`, `sales-invariant.test.ts`, ampliación de `ledger-invariant.test.ts` y de `cash-concurrency.test.ts` (venta durante el cierre) | V1 a V4; última pieza, venta durante el cierre, reintento idempotente y pago que no cuadra en verde; invariantes en verde; ningún escritor del libro fuera de `modules/inventory` |
| S4  | Comprobante, configuración e incidencias API | backend, testing            | `modules/sales/receipt.service.ts`, `modules/sales/incidents.routes.ts` y `incidents.service.ts`, `modules/settings/business-settings.routes.ts` y `.service.ts`; esquemas compartidos; `app.ts`; `sales-receipt.test.ts`, `sale-incidents.test.ts`, `business-settings.test.ts`; `docs/api/API.md`                                                                            | V5, V6, N1 a N4, S1 y S2; prueba «la incidencia no cambia stock ni importes» en verde                                                                                             |
| S5  | Web caja                                     | frontend, testing           | `apps/web/src/features/cash/**`; `router.tsx`; `app-shell.tsx` (grupo «Ventas»; quitar «Devoluciones»); `features/audit/audit-labels.ts`                                                                                                                                                                                                                                       | Abrir, ver, cerrar, historial y corregir desde la interfaz; pruebas de componentes                                                                                                |
| S6  | Web POS y comprobante                        | frontend, testing           | `features/sales/` (`pos-page.tsx`, `cart.ts`, `payments.ts`, `scan-input.tsx`, `review-step.tsx`, `receipt.tsx`, `receipt-page.tsx`, `receipt-settings.ts`, `use-sales.ts`); `features/settings/business-settings-page.tsx`; `router.tsx`; `app-shell.tsx`                                                                                                                     | Venta completa con lector simulado, revisión obligatoria, estados de error de §5.4, impresión en los cuatro formatos y «COPIA»                                                    |
| S7  | Web historial e incidencias                  | frontend, testing           | `features/sales/` (`sales-page.tsx`, `sale-page.tsx`, `incidents-page.tsx`, `report-incident-dialog.tsx`); `router.tsx`; `app-shell.tsx`                                                                                                                                                                                                                                       | Listado con filtros, detalle sin acciones de anulación, alta y cierre de incidencias                                                                                              |
| S8  | E2E y cierre                                 | testing, documentación      | `apps/web/e2e/*.spec.ts` de §6.5; `responsive.spec.ts`; `apps/api/prisma/seed-demo.ts` (medios y caja de demostración, sin ventas reales); `docs/testing/TESTING.md`, `docs/business/DOMINIO.md`, `docs/architecture/ARCHITECTURE.md`, `CHANGELOG.md`, manual por rol                                                                                                          | E2E por rol en verde; `npm run check` y `npm run qa -- check` en verde; documentación al día                                                                                      |

Reglas de las rebanadas:

- S1 no se inicia sin S0 (0.2 y ADR). S2 y S3 no se inician sin confirmar el contrato del helper de
  idempotencia (I-6).
- Las migraciones de S1 llevan marca de tiempo **posterior** a las de idempotencia y garantías.
- Ningún agente edita migraciones aplicadas ni desactiva reglas de ESLint; sin dependencias nuevas.
- S4 y S7 (incidencias) pueden retirarse si el responsable mantiene la hoja fuera del sistema (X-1);
  nada más depende de `sale_incidents`.
- No se opera con dinero real hasta S8 completa y hasta cerrar 0.4 (piloto E7, fuera de este plan).

## 8. Riesgos de la matriz 07

| Riesgo | Tema                                 | Estado con este plan       | Control aplicado o motivo                                                                                        |
| ------ | ------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| RK-01  | Venta errónea no anulable            | Cubierto en prevención     | Revisión obligatoria con foto, CT-12, CT-13; registro de incidencia. Residual: el error es permanente por diseño |
| RK-02  | Duplicado por reintento              | Cubierto                   | CT-01, CT-02, botón deshabilitado. Abierto: dos carritos idénticos con claves distintas (SD-A03)                 |
| RK-03  | Pérdida de conexión al confirmar     | Cubierto                   | Clave persistida, estado «resultado incierto», repetición evaluada antes de la caja (I-5)                        |
| RK-04  | Fallo de impresión                   | Cubierto                   | Impresión desacoplada de la venta; reimpresión                                                                   |
| RK-05  | Cobro mal registrado                 | Parcial                    | CT-10 y revisión previa. Abierto: no hay corrección del medio (SD-A02); se reporta como incidencia               |
| RK-06  | Diferencia de efectivo               | Cubierto                   | Arqueo con observación obligatoria; corrección de captura solo del Administrador                                 |
| RK-07  | Cierre concurrente                   | Cubierto                   | CT-03, CT-04, cierre idempotente, pruebas con mutante                                                            |
| RK-08  | Venta durante el cierre              | Cubierto                   | `FOR SHARE` y `FOR UPDATE`, trigger `sales_require_open_session`, prueba con compuerta                           |
| RK-09  | Pago mixto mal registrado            | Parcial                    | Σ pagos = total y vuelto solo en efectivo. Abierto: reparto entre medios equivocado (SD-A02)                     |
| RK-10  | Recuperación de datos                | **Abierto**                | Copias, RPO y RTO, hosting local (D5, P-18, P-26): fuera de este plan                                            |
| RK-11  | Comprobante inconsistente            | Cubierto                   | Snapshots (incluido el nombre del medio), comprobante desde filas inmutables, triggers de suma                   |
| RK-12  | No anulación frente a cambios        | **Abierto**                | E4 diferida; `POST /inventory/exchanges` sigue sin vínculo con ventas (CP-10 es procedimiento)                   |
| RK-13  | Vender sin caja                      | Cubierto                   | Venta y caja se entregan juntas; `cash_session_id NOT NULL`                                                      |
| RK-14  | QR y transferencia sin conciliar     | Parcial                    | Totales por medio en el cierre. Abierto: informe por referencia y conciliación (CT-16, CP-04)                    |
| RK-15  | Numeración con saltos                | Aceptado                   | B10; índice único; sin informe de huecos                                                                         |
| RK-16  | Sesión de 8 h                        | Parcial                    | Carrito y clave en `sessionStorage`. Abierto: aviso de vencimiento (CT-17)                                       |
| RK-17  | Reloj y zona horaria                 | Cubierto                   | `sold_at` del servidor; filtros con `dayRangeLaPaz`; el orden lo deciden los bloqueos                            |
| RK-18  | Última pieza                         | Cubierto                   | Orden de bloqueos, `CHECK (quantity >= 0)`, prueba concurrente                                                   |
| RK-19  | Stock poco confiable                 | **Abierto**                | Depende de la carga inicial manual (D2) y de los conteos                                                         |
| RK-20  | Corrección encubierta                | Parcial                    | AE-1 a AE-10, incidencias sin efecto, guarda estática. Abierto: informe CT-14 y segregación (P-43 aceptada)      |
| RK-21  | Cuenta comprometida                  | **Abierto**                | Sin 2FA (D7); fuera de alcance                                                                                   |
| RK-22  | Venta no registrada o fraude de caja | Parcial                    | Arqueo por sesión y `seller_id`. Abierto: informes por vendedor (E5)                                             |
| RK-23  | Reimpresión como falso justificante  | Cubierto                   | Marca «COPIA» y auditoría. Límite: el servidor no sabe si salió papel                                            |
| RK-24  | Cambio de precio durante la venta    | Cubierto                   | `expectedUnitPrice`, `expectedTotal`, `409 PRICE_CHANGED`                                                        |
| RK-25  | Deriva del libro                     | Cubierto (con dependencia) | Solo `applyStockChanges`; invariantes; I-01, I-02 e I-05 del otro agente                                         |
| RK-26  | Ventas transcritas tarde             | **Abierto**                | Q-V14 pendiente; sin fecha retroactiva                                                                           |

## 9. Contradicciones detectadas

| ID  | Contradicción                                                                                                                                                                                                                                                    | Tratamiento en este plan                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| X-1 | **Incidencias.** La aclaración de C5 (2026-11-09, delegada) dice «hoja numerada y fuera del sistema… No se crea una entidad del sistema». El encargo del 2026-11-10 pide incidencias dentro del sistema.                                                         | D-10: entidad de solo trazabilidad, separable. **Requiere confirmación expresa**; si no, se retiran S4 y S7 (incidencias) |
| X-2 | **Autorización.** `CLAUDE.md` y RESOLUCIONES-2026-11-09 dicen que Ventas no está autorizada; la autorización del 2026-11-10 no está en el repositorio.                                                                                                           | Precondición 0.2 y rebanada S0                                                                                            |
| X-3 | **Idempotencia.** Los documentos 02, 03, 04 y 10 usan `clientRequestId` en el cuerpo; el helper genérico usa la cabecera `Idempotency-Key`.                                                                                                                      | Regla I-1: solo cabecera; las columnas de dominio conservan sus nombres                                                   |
| X-4 | **Orden de inserción.** 03 §8.1 inserta `sales` antes de bloquear variantes, pero `total` es `NOT NULL` e inmutable y depende de precios leídos bajo bloqueo.                                                                                                    | §4.5: `INSERT sales` después del libro; repetición en los pasos 1, 4 y 10                                                 |
| X-5 | **Residuos de versiones previas.** 04 §3.1 cita `discount_amount`, `subtotal`, `discount_total` y un estado `COMPLETED`; 03 omite `status` y descuentos. 03 §4.2 dibuja `cash_movements`, excluida por B6. 02 §8 lista rutas de movimientos y notas de apertura. | Rige 03 con las actualizaciones del 2026-11-09: sin estado, sin descuentos, sin `cash_movements`, sin nota de apertura    |
| X-6 | **Movimiento de venta.** El encargo habla de un «enum de movimientos nuevo»; `movement_type` **ya contiene** `SALE` (reservado).                                                                                                                                 | No hay `ADD VALUE`; solo se agrega `SALE` a `REFERENCE_TYPES`                                                             |
| X-7 | **Navegación.** El encargo cita `navigation.tsx`; en esta rama el menú está en `app-shell.tsx`.                                                                                                                                                                  | Precondición 0.7                                                                                                          |
| X-8 | **Nombre del medio en el comprobante.** 04 §3.1 recomienda snapshot `method_name`; 03 §5.4 no lo incluye.                                                                                                                                                        | Se incluye `sale_payments.method_name` (las ventas son inmutables: no se puede añadir después)                            |
| X-9 | **`ARCHITECTURE.md`** describe un módulo `invoicing` integrado con el SIN, contrario a Q-V02; y `CLAUDE.md` lista «punto de venta» en «NO hacer».                                                                                                                | Fuera de este plan; se actualizan en S0 y S8 con orden del responsable                                                    |

## 10. ADR a redactar en S0

Se recomienda conservar la numeración que ya citan los documentos de análisis (alternativa: usar
022, 023 y 024 consecutivos y anotar la equivalencia en el índice; consecuencia: los documentos 01 a
10 quedarían con referencias desfasadas).

| ADR     | Título                                              | Contenido mínimo                                                                                                                                                                               |
| ------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-024 | Venta de mostrador atómica, idempotente e inmutable | DEC-V07; sin estado ni anulación; snapshots; triggers; orden de bloqueos (§3.12); uso de `SALE` y de `applyStockChanges`; incidencias sin efecto; alternativas descartadas (estado, anulación) |
| ADR-028 | Caja única, arqueo y correcciones append-only       | DEC-V09, B1 a B9; índice parcial; esperado calculado y congelado; `cash_session_corrections` y controles AE; alternativas A a F de 10 §3                                                       |
| ADR-029 | Comprobante interno e impresión por navegador       | DEC-V12, C1 a C4; proyección de filas inmutables; `sale_receipt_prints`; `business_settings` como registro único (excepción a UUID); alternativas de 04 §15                                    |
| —       | ADR-025                                             | **No se emite**: «sustituido por DEC-V07» en el índice                                                                                                                                         |

Nota a ADR-017 y ADR-019 (sin editarlos, respuesta E1 del 2026-11-09): los ajustes y los cambios no
se usan para corregir ventas (C5).

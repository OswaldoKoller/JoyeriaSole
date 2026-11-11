# Decisiones pendientes de definición

> Ninguna de estas decisiones debe implementarse como regla definitiva sin aprobación explícita del
> cliente. Cuando se apruebe una, se actualiza su estado aquí, se registra en `docs/decisions/` si es
> estructural, y recién entonces se implementa.

Estados: 🟡 PENDIENTE o PARCIAL · 🟢 APROBADA, CERRADA o IMPLEMENTADA · ⚪ SUSTITUIDA o DESCARTADA ·
🟠 POR CONFIRMAR (aplicada por defecto del modo más conservador; no es una regla confirmada).

Respuestas comunicadas por el cliente: [2026-10-09](RESOLUCIONES-2026-10-09.md),
[2026-10-11](RESOLUCIONES-2026-10-11.md) y [2026-11-05](RESOLUCIONES-2026-11-05.md) (la sección 7 de
esta última prevalece cuando difiere de las anteriores); para Ventas (Fase 2),
[2026-11-07](RESOLUCIONES-2026-11-07.md) y [2026-11-09](RESOLUCIONES-2026-11-09.md). Una respuesta
aprobada puede estar sin
implementar: la columna «Lo preparado hoy» indica qué existe en el sistema. Este documento tiene **una
sola fila por ID** con su estado actual.

## Usuarios, roles y seguridad

| ID   | Decisión                                                                                                                                               | Estado          | Lo preparado hoy                                                                                                                                                                                                                                                                                                                                                                                                                                       | Alternativas                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| P-01 | ¿El responsable de inventario puede **aprobar** sus propios inventarios físicos y ajustes, o debe aprobar el administrador (segregación de funciones)? | 🟢 IMPLEMENTADA | **Regla compartida (2026-11-05, posterior a Q-01 B):** el Administrador **y** el Responsable autorizan: aprueban ajustes (`inventory:adjust-approve`, [ADR-017](../decisions/ADR-017-ajustes-solicitud-aprobacion.md)) y los conteos (`inventory-counts:approve`, [ADR-021](../decisions/ADR-021-conteo-a-ciegas-segundo-recuento.md)), también los propios (P-43). Quien solo tenga `inventory:adjust` solicita y espera la aprobación. Sin umbrales. | a) Solo ADMIN aprueba · b) Responsable aprueba hasta un umbral · c) Responsable aprueba todo |
| P-02 | ¿El vendedor puede **ver costos** de compra?                                                                                                           | 🟢 APROBADA     | Permiso `costs:read` separado de `catalog:read`. El Vendedor no recibe costos ni valorizaciones en ninguna respuesta (probado).                                                                                                                                                                                                                                                                                                                        | a) No ve costos · b) Sí ve                                                                   |
| P-19 | Política de contraseñas, duración de sesión y si se requiere **2FA**.                                                                                  | 🟢 IMPLEMENTADA | Argon2id, mínimo 10 caracteres, sesión **fija de 8 h** desde el login sin extensión por actividad (Q-02 A; antes 3 h). Sin 2FA. Contraseña olvidada: clave temporal del Administrador con cambio obligatorio (F2). La pregunta de 2FA para administradores (F4/F5) sigue sin respuesta.                                                                                                                                                                | a) Mantener · b) 2FA para ADMIN · c) 2FA para todos                                          |
| P-21 | ¿Un usuario puede tener **varios roles**?                                                                                                              | 🟢 APROBADA     | Sí (confirmado 2026-11-05). El modelo lo soporta (`user_roles`) y la pantalla de Usuarios permite asignar varios.                                                                                                                                                                                                                                                                                                                                      | a) Un rol por usuario · b) Varios                                                            |
| P-23 | Tiempo de **retención** de auditoría y sesiones vencidas.                                                                                              | 🟢 APROBADA     | Se guardan indefinidamente.                                                                                                                                                                                                                                                                                                                                                                                                                            | a) Indefinido · b) N años                                                                    |

> **Nota (2026-11-09, sin cambio de estado):** el responsable respondió que **no** habrá 2FA para los
> administradores ([RESOLUCIONES-2026-11-09](RESOLUCIONES-2026-11-09.md), D7), con lo que la pregunta de
> 2FA de P-19 queda contestada: se mantiene sin 2FA. Habrá dos administradores («Claudia» y «ADMINI2»);
> la fecha «01/11/26» que acompañó a esa respuesta es solo la de alta de ese personal (D6), no la de
> arranque del sistema, que sigue sin definirse.

## Catálogo y productos

| ID   | Decisión                                                                                                                                            | Estado               | Lo preparado hoy                                                                                                                                                                                                                                                                                                                                                                                                  | Alternativas                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| P-04 | **Profundidad** del árbol de categorías (¿solo categoría → subcategoría?).                                                                          | 🟢 IMPLEMENTADA (S2) | Dos niveles (categoría → subcategoría), validados por la API; el árbol auto-referenciado de la base no tiene límite. Crean y modifican categorías el Administrador y el Responsable (B1).                                                                                                                                                                                                                         | a) 2 niveles · b) Ilimitado                                                |
| P-05 | **Formato del SKU** (manual, automático, compuesto por códigos de atributos, p. ej. `ANI-SOL-P925-16`).                                             | 🟢 IMPLEMENTADA      | SKU automático correlativo (`SKU-000001`, secuencia de PostgreSQL; puede haber huecos, nunca duplicados). `attribute_options.code` queda disponible por si se quisiera componerlo.                                                                                                                                                                                                                                | a) Manual · b) Automático correlativo · c) Compuesto                       |
| P-06 | **Códigos de barras**: ¿se usan los del proveedor, se imprimen etiquetas propias, o ambos? ¿Simbología (EAN-13, Code 128)? ¿Qué contiene el **QR**? | 🟢 CERRADA (S2)      | Se conserva el código del proveedor si existe y no está repetido; si lo está, no se guarda como código de barras, se avisa y la pieza se identifica por su SKU (el código queda en `supplier_products` si se conoce el proveedor). Etiqueta propia Code 128 con el **SKU** para todas las piezas (Q-10 A). Sin QR (B6). Falta definir la impresora y el rollo reales (B7): el tamaño de etiqueta es configurable. | a) Etiquetas propias Code 128 con el SKU · b) EAN del proveedor · c) Mixto |
| P-15 | **Valores** de cada atributo (lista de materiales, tallas, piedras, colores, colecciones...).                                                       | 🟢 IMPLEMENTADA (S2) | Gestión de valores (crear, editar, desactivar), definiciones nuevas y asignación a categorías desde la web con `catalog:manage`; valores descriptivos por producto. Las **listas de valores las entrega el cliente**: no se cargaron.                                                                                                                                                                             | El cliente entrega las listas                                              |
| P-17 | ¿Se controlan **lotes o números de serie** (p. ej. piezas de oro con certificado)?                                                                  | 🟢 NO (Q-03 A)       | No modelado: «serial» se entiende como el código que identifica cada pieza (SKU + código de barras o del proveedor). Agregarlo implicaría una tabla de lotes o series y referencia en movimientos.                                                                                                                                                                                                                | a) No · b) Lote · c) Serie por pieza                                       |
| P-22 | ¿Se puede **desactivar** un producto/variante con stock > 0?                                                                                        | 🟢 IMPLEMENTADA      | **Bloquear:** `STOCK_BLOCKS_DEACTIVATION` en producto y variante. Para descontinuar: ajuste de salida a cero y luego desactivar (B11); la eliminación física de fichas sin movimientos es solo del Administrador.                                                                                                                                                                                                 | a) Bloquear · b) Permitir con advertencia                                  |
| P-27 | Datos específicos de joyería: **peso en gramos, quilataje, certificados, fotos**.                                                                   | 🟢 IMPLEMENTADA (S2) | Sin gramaje ni quilataje (B9): se usan variantes y características descriptivas (texto, número, lista, sí/no) definidas por el cliente. Las fotos se resolvieron aparte (ver P-14).                                                                                                                                                                                                                               | a) Atributos · b) Columnas propias                                         |

### Decisiones tomadas por defecto en el catálogo (S2), por confirmar con el cliente

Se implementaron del modo más conservador; confirmar con el cliente cuando convenga.

| ID   | Decisión                                                                                                                                                                 | Estado | Aplicado hoy                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-28 | ¿«Obligatorio» por categoría debe **bloquear** el guardado de la ficha? C1 permite fichas incompletas.                                                                   | 🟠     | Solo la pantalla pide los atributos obligatorios de la categoría; la API los acepta vacíos.                                                                                                                                                                                                                                                                                            |
| P-29 | ¿«Sin precio» e «incompleta» cuentan piezas **inactivas**?                                                                                                               | 🟠     | No: contadores y filtros ignoran productos inactivos; «Sin precio» mira solo variantes activas.                                                                                                                                                                                                                                                                                        |
| P-31 | Un código de proveedor que corresponde a **varias piezas** (de distintos proveedores): ¿cuál se muestra?                                                                 | 🟠     | La búsqueda responde 409 y pide usar el SKU.                                                                                                                                                                                                                                                                                                                                           |
| P-32 | ¿El código propio generado (`SOLE-…`) sigue haciendo falta si la etiqueta imprime siempre el SKU?                                                                        | 🟠     | Se conserva el botón «Generar código propio» (Q-10); la etiqueta usa el SKU.                                                                                                                                                                                                                                                                                                           |
| P-33 | ¿Quién fija el **precio de venta al crear** la pieza? (D4: lo aprueban o lo cambian el Administrador o el Responsable). _Antes numerada P-30 en el catálogo (ver nota)._ | 🟢     | Fijar el precio inicial al crear una pieza o variante exige `prices:approve` (Administrador y Responsable, regla compartida de 2026-11-05) y queda en el historial como precio inicial. Quien solo propone, crea la pieza con precio 0 y luego lo **solicita** desde Precios ([ADR-018](../decisions/ADR-018-aprobacion-e-historial-de-precios.md)). Resuelto por la regla compartida. |

## Costos y precios

| ID   | Decisión                                                                                                                                                                                    | Estado          | Lo preparado hoy                                                                                                                                                                                                                                                                                                                                                                                                                                     | Alternativas                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P-03 | Regla comercial **Costo total × 2 = Precio de venta**. ¿Es obligatoria, sugerida, con excepciones? ¿Redondeo?                                                                               | ⚪ SUSTITUIDA   | **Sin fórmula ni multiplicador ni redondeo** (Q-04/Q-05, 2026-11-05): el cliente fija el precio de cada ítem **a mano** mirando su costo total. No hay sugerencia ni calculadora. `sale_price` se guarda explícitamente por variante (neto, en Bs). Implementado en S7 ([ADR-018](../decisions/ADR-018-aprobacion-e-historial-de-precios.md)). Se muestra la ganancia en Bs y el % sobre el costo (Q-06).                                            | (Descartadas) a) Solo sugerencia editable · b) Automática con excepciones · c) Multiplicador por categoría |
| P-07 | **Prorrateo** de transporte, embalaje y otros costos del ingreso entre los ítems (por valor, por cantidad, manual). Método de **costeo** del inventario (último costo, promedio ponderado). | 🟢 IMPLEMENTADA | Prorrateo por valor de compra y **último costo**; centavos por mayor resto y bloqueo con valor de compra cero ([ADR-013](../decisions/ADR-013-costeo-ingresos.md), [ADR-015](../decisions/ADR-015-reparto-centavos-y-valor-cero.md)). **Ampliado (S5):** se aplica sobre el valor ya convertido a Bs y los costos adicionales son una lista abierta de montos en Bs ([ADR-016](../decisions/ADR-016-compras-en-dolares-y-costos-de-importacion.md)). | Prorrateo: a) por valor · b) por unidades · c) manual. Costeo: a) último costo · b) promedio ponderado     |
| P-10 | **Moneda** (¿solo bolivianos? ¿compras en dólares?).                                                                                                                                        | 🟡 PARCIAL      | **Soporte USD (Q-07 A, implementado en S5):** moneda por ingreso (Bs o USD) con tipo de cambio manual del ingreso, fijo al confirmar; solo dólares (no yuanes). El sistema sigue en Bs ([ADR-016](../decisions/ADR-016-compras-en-dolares-y-costos-de-importacion.md)). Falta confirmar si se necesitarán otras monedas o una cotización de referencia.                                                                                              | a) Solo Bs · b) Multimoneda con tipo de cambio                                                             |
| P-25 | ¿Los cambios de precio requieren **aprobación**? ¿Se necesita historial de precios consultable?                                                                                             | 🟢 CERRADA (S7) | Quien tiene `prices:propose` **solicita**; el Administrador y el Responsable **aprueban** (uno o en masa) o cambian directamente (`prices:approve`); vigencia inmediata; sin umbrales. Historial inmutable en la entidad propia `price_changes` y auditoría ([ADR-018](../decisions/ADR-018-aprobacion-e-historial-de-precios.md)).                                                                                                                  | a) Auditoría basta · b) Tabla de historial · c) Flujo de aprobación                                        |

## Inventario e ingresos

| ID   | Decisión                                                                                                              | Estado              | Lo preparado hoy                                                                                                                                                                                                                                                      | Alternativas                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P-08 | ¿Se permite **stock negativo**?                                                                                       | 🟢 IMPLEMENTADA     | **Nunca:** `CHECK (quantity >= 0)` en `inventory_balances` además de la validación del servicio.                                                                                                                                                                      | a) Nunca · b) Permitido con alerta                                               |
| P-09 | **Unidad de control**: ¿todo por unidades (piezas) o hay productos por peso/longitud?                                 | 🟢 APROBADA         | Todo en piezas enteras.                                                                                                                                                                                                                                               | a) Solo piezas · b) Decimales para algunos productos                             |
| P-11 | Formato del **número de ingreso** e inventario (ING-000123).                                                          | 🟢 IMPLEMENTADA     | Correlativo automático: ingresos `ING-000123`, ajustes `AJ-000001`, conteos `CNT-000001`.                                                                                                                                                                             | —                                                                                |
| P-12 | **Tipos de documento** de recepción (factura, nota de remisión, guía...).                                             | 🟢 APROBADA         | Texto libre `document_type`.                                                                                                                                                                                                                                          | a) Catálogo fijo · b) Libre                                                      |
| P-13 | **Alcance** de un inventario físico y si se **bloquean** movimientos durante el conteo.                               | 🟢 IMPLEMENTADA     | Resuelto en [ADR-021](../decisions/ADR-021-conteo-a-ciegas-segundo-recuento.md): conteo por categoría (incluye subcategorías), movimientos **no bloqueados** y conciliados al aprobar; varios conteos a la vez solo si no comparten variantes (Q-13 B).               | a) Bloquear · b) No bloquear y conciliar movimientos ocurridos durante el conteo |
| P-20 | Catálogo de **motivos de ajuste** (pérdida, robo, daño, error de registro...).                                        | 🟢 IMPLEMENTADA     | Catálogo `adjustment_reasons` (Robo, Pérdida, Muestra, Rotura, Error de registro, Otro; «Otro» exige observación) más observación libre ([ADR-017](../decisions/ADR-017-ajustes-solicitud-aprobacion.md)).                                                            | a) Catálogo fijo · b) Libre                                                      |
| P-24 | **Productos nuevos durante un ingreso**: ¿quién los crea y con qué estado? ¿Se pueden recibir piezas no esperadas?    | 🟢 CERRADA (C1, S5) | Alta rápida dentro del ingreso con categoría, nombre, costo y cantidad: la pieza queda **activa**, con precio de venta 0 y marca «ficha incompleta», sin bloqueo (no se podrá vender en Fase 2 hasta tener precio, D9). Ver P-36 y P-41.                              | —                                                                                |
| P-30 | ¿Quién registra los **cambios de pieza** en el futuro punto de venta? ¿La pieza devuelta se revisa antes de venderse? | 🟡 PENDIENTE        | Base lista ([ADR-019](../decisions/ADR-019-cambios-de-pieza.md)): permiso `inventory:exchange` solo para Administrador y Responsable; sin pantalla de registro (Q-12 A, 12.1 A). La pieza devuelta entra al stock vendible. Decidir con el módulo de ventas (Fase 2). | a) Vendedor · b) Responsable                                                     |

### Decisiones abiertas del conteo físico (ADR-021)

Implementadas del modo más simple; confirmar con el cliente.

| ID   | Decisión                                                                                                                                                                                    | Estado | Aplicado hoy                                                                                                                                          | Alternativas                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P-C1 | ¿El segundo recuento debe hacerlo **otra persona** distinta de quien hizo el primer conteo? (el cliente no lo exigió)                                                                       | 🟡     | Sin restricción: el operador puede ser el mismo o tomar el conteo otro usuario ([ADR-021](../decisions/ADR-021-conteo-a-ciegas-segundo-recuento.md)). | a) Sin restricción (hoy) · b) Obligar a otro usuario                                                                 |
| P-C2 | ¿Qué pasa con los **hallazgos** una vez regularizados (¿se da de alta el producto, se transfiere el stock a la otra categoría?) y si un hallazgo pendiente debe **bloquear** la aprobación. | 🟡     | Los hallazgos solo se registran y se marcan «regularizados» con nota; no bloquean la aprobación ni crean productos.                                   | a) Solo registro (hoy) · b) Bloquear la aprobación mientras haya pendientes · c) Crear el producto desde el hallazgo |
| P-C3 | **Diferencias grandes** en un conteo: ¿requieren aviso o una segunda aprobación (relacionado con E1)?                                                                                       | 🟡     | Sin umbrales: aprueba quien tenga `inventory-counts:approve`.                                                                                         | a) Sin umbral (hoy) · b) Aviso al Administrador sobre un monto o porcentaje                                          |

### Decisiones tomadas por defecto en los ingresos v2 (S5), por confirmar con el cliente

Implementadas del modo más conservador; no son reglas confirmadas. Antes se identificaban como S5-01 a S5-06
(ver nota de numeración).

| ID   | Decisión                                                                                                                                                                           | Estado | Lo implementado hoy                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-34 | Quién puede **ver ingresos sin ver costos** (un rol con `stock-entries:read` pero sin `costs:read`).                                                                               | 🟠     | Ve el ingreso con todos los campos de costo en `null`; para cargar precios, costos, piezas nuevas o confirmar se exige además `costs:read`. El Vendedor no tiene acceso a ingresos.                                                                                    |
| P-35 | **Redondeo al mostrar totales** del ingreso en Bs (los cálculos son exactos a 4 decimales por unidad y centavos por parte).                                                        | 🟠     | Los totales mostrados se redondean a centavos con la mitad hacia arriba ([ADR-016](../decisions/ADR-016-compras-en-dolares-y-costos-de-importacion.md)).                                                                                                               |
| P-36 | **Cómo se limpia la marca «ficha incompleta»** y quién completa la ficha.                                                                                                          | 🟠     | La marca manual (`profileIncomplete`) queda hasta que quien tenga `catalog:manage` la marca como completa en la ficha del producto (`PATCH /products/:id` con `profileIncomplete: false`). El Inicio muestra el contador de fichas incompletas (S2); ver también P-41. |
| P-37 | **Código del proveedor repetido** dentro del mismo proveedor (otra pieza ya lo usa).                                                                                               | 🟠     | No se guarda como código de barras ni en la relación proveedor-pieza; se avisa. La pieza se identifica por su SKU (Q-10b).                                                                                                                                             |
| P-38 | **Fecha del documento** de un borrador ya guardado que supera los 30 días.                                                                                                         | 🟠     | Solo se vuelve a validar si se cambia la fecha: el borrador antiguo no queda bloqueado para editarlo.                                                                                                                                                                  |
| P-39 | **Ingresos antiguos confirmados**: el costo adicional asignado y el costo total por ítem se reconstruyen desde el costo adicional unitario (el reparto exacto no se guardó antes). | 🟠     | Migración `20261106020100`; el costo unitario vigente no cambia.                                                                                                                                                                                                       |

### Decisiones tomadas por defecto en la integración de la Fase 1 (2026-11-05), por confirmar con el cliente

Surgieron al unir las tres pistas de trabajo (catálogo, ingresos/precios e inventario).

| ID   | Decisión                                                                                                                          | Estado | Aplicado hoy                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-40 | ¿Quién puede cargar el **stock inicial** de una pieza? Cambia el stock **sin aprobación previa**, a diferencia de un ajuste.      | 🟢     | Permiso propio `inventory:initial-stock` (`POST /inventory/:variantId/initial`) **para el Administrador y el Responsable de inventario** (regla compartida de 2026-11-05; resuelta). Antes lo habilitaba `inventory:adjust`, que no basta para cargarlo. Un rol que solo tenga `inventory:adjust` puede solicitar ajustes. La carga inicial no pasa por la aprobación de ajustes: queda auditada y es un riesgo aceptado (P-43). |
| P-41 | ¿Cuándo se considera **incompleta** una ficha? Hay dos señales: la marca manual del alta rápida y la falta de datos descriptivos. | 🟠     | Una ficha está incompleta si **cualquiera** de las dos es verdadera: `profileIncomplete` (marca manual, nace en el alta rápida de ingresos y se limpia a mano, P-36) **o** `isIncomplete` calculado (sin descripción **y** sin características descriptivas). Filtros, insignias y contador del Inicio usan esta combinación; la marca manual sola no se pierde aunque la ficha tenga descripción.                               |
| P-42 | ¿Cómo se avisa al Administrador de lo que espera su aprobación? (E1, Q-14 A: sin correo).                                         | 🟠     | Bandeja **«Pendientes de aprobación»** en el Inicio (`GET /approvals/pending`): cuenta los **ajustes pendientes**, los **cambios de precio pendientes** y los **conteos en revisión**. Cada total solo se calcula si la persona tiene el permiso para resolver ese tipo; el Responsable ve los tres tipos. No hay umbrales por monto (E1 quedó sin cifras) ni correo.                                                            |
| P-43 | Riesgo aceptado: una sola persona (el Responsable) solicita y aprueba ajustes, precios y conteos, y registra cambios de pieza.    | 🟠     | No hay segregación de funciones: quien tiene `inventory:adjust-approve`, `prices:approve` o `inventory-counts:approve` puede aprobar sus solicitudes y quien tiene `inventory:exchange` registra cambios de pieza sin segundo aprobador. Queda trazable en la auditoría (quién pidió y quién la aprobó). Alternativa futura: exigir un segundo aprobador por umbral de valor (decisión del cliente cuando quiera más control).   |

### Decisiones tomadas por defecto en la pantalla de Auditoría, por confirmar con el cliente

| ID      | Decisión                                                                                 | Estado | Aplicado hoy                                                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-AUD-1 | ¿La auditoría se puede **exportar** (CSV/PDF) para revisiones externas?                  | 🟠     | **No hay exportación.** Solo consulta en pantalla, de solo lectura. Si se necesita, depende de las respuestas de reportes y exportaciones (G1–G6).                                                                                                   |
| P-AUD-2 | ¿Qué debe poder buscarse en la auditoría además de acción, tipo/ID de entidad y usuario? | 🟠     | Se busca por texto en acción, tipo, ID de entidad y nombre o correo del usuario. **No** por nombre o SKU de la pieza afectada (el registro guarda el ID de la entidad). Los campos sin etiqueta del antes/después se muestran con su nombre técnico. |

## Infraestructura

| ID   | Decisión                                                                                                                        | Estado       | Lo preparado hoy                                                                                                                                                                                      | Alternativas                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| P-14 | **Archivos**: fotos de productos (resuelto en S3: PostgreSQL, ADR-020); escaneo de documentos de recepción (sigue sin decidir). | 🟡 PARCIAL   | Fotos implementadas: hasta 5 por producto, una portada, JPG/PNG/WebP reducidas a ~1200 px ([ADR-020](../decisions/ADR-020-fotos-de-producto.md)). Los documentos escaneados no tienen almacenamiento. | a) No por ahora · b) Reutilizar `PhotoStorage` |
| P-16 | **Identidad visual** (logo, colores).                                                                                           | 🟡 PENDIENTE | Paleta dorada provisional en `apps/web/src/index.css`.                                                                                                                                                | —                                              |
| P-18 | **Proveedor de hosting**, dominio y presupuesto mensual.                                                                        | 🟡 PENDIENTE | Recomendación en `docs/deployment/DEPLOYMENT.md`.                                                                                                                                                     | Render · Railway · VPS                         |
| P-26 | **RPO/RTO** aceptables (cuántos datos se pueden perder y cuánto tiempo puede estar caído).                                      | 🟡 PENDIENTE | Propuesta en `docs/deployment/BACKUPS.md`.                                                                                                                                                            | —                                              |

> **Nota (2026-11-09, sin cambio de estado):** el responsable indicó que el despliegue será **local**, en
> la PC donde se ejecutará el sistema, y lo dejó para después
> ([RESOLUCIONES-2026-11-09](RESOLUCIONES-2026-11-09.md), D5). Eso contradice la recomendación de
> Render de `DEPLOYMENT.md` y el «acceso desde Internet» de `CLAUDE.md`. P-18 (hosting) y P-26
> (RPO/RTO) siguen pendientes: hay que decidir las copias de respaldo en el sitio, el HTTPS en la red
> local y quién puede acceder.

## Ventas (Fase 2)

Preguntas **Q-V01 a Q-V17** de la propuesta de Fase 2
([matriz de decisiones](../propuestas/fase-2-ventas/01-matriz-de-decisiones.md) y
[subdecisiones pendientes](../propuestas/fase-2-ventas/08-subdecisiones-pendientes.md)). Se identifican
con el prefijo **Q-V** (el informe técnico las llamaba P-V). Fuentes:
[RESOLUCIONES-2026-11-07](RESOLUCIONES-2026-11-07.md) y
[RESOLUCIONES-2026-11-09](RESOLUCIONES-2026-11-09.md); los códigos A1 a F4 que aparecen abajo son las
respuestas de ese cuestionario.

**Nada de Ventas está implementado ni autorizado para implementarse:** la autorización del 2026-11-07
es «solo análisis y planificación». Las respuestas del 2026-11-09 definen el diseño, no lo habilitan.

| ID    | Decisión                     | Estado        | Lo registrado hoy                                                                   |
| ----- | ---------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| Q-V01 | Mínimo para empezar a vender | 🟢 CONFIRMADA | Venta de mostrador con comprobante interno.                                         |
| Q-V02 | Facturación                  | 🟢 CONFIRMADA | La facturación fiscal se realizará mediante un sistema externo.                     |
| Q-V03 | Impuestos                    | 🟢 CONFIRMADA | El precio registrado representa el total cobrado; la aplicación no añade impuestos. |
| Q-V04 | Medios de pago y moneda      | 🟢 CONFIRMADA | Efectivo, QR, transferencia y combinaciones; solo en bolivianos.                    |
| Q-V05 | Crédito y apartados          | 🟢 CONFIRMADA | Solo ventas pagadas íntegramente al momento; sin créditos ni apartados.             |
| Q-V06 | Descuentos                   | 🟡 PENDIENTE  | Sin respuesta.                                                                      |
| Q-V07 | Anulación de ventas          | 🟢 CONFIRMADA | Prohibida por el flujo ordinario. Excepciones: parciales (ver nota).                |
| Q-V08 | Cambios de pieza (P-30)      | 🟡 PENDIENTE  | Diferida el 2026-11-09: E4 de Ventas queda para después. Rige P-30.                 |
| Q-V09 | Caja única                   | 🟢 CONFIRMADA | Una caja lógica única. Las 8 subdecisiones se respondieron el 2026-11-09.           |
| Q-V10 | Clientes                     | 🟡 PENDIENTE  | Sin respuesta.                                                                      |
| Q-V11 | Stock negativo en ventas     | 🟡 PENDIENTE  | Sin respuesta para ventas; rige P-08 (stock nunca negativo).                        |
| Q-V12 | Comprobante y numeración     | 🟡 PARCIAL    | Mecanismo confirmado; faltan formato del correlativo y datos reales del negocio.    |
| Q-V13 | Roles y permisos de ventas   | 🟡 PARCIAL    | Se fijó quién abre y cierra caja; falta quién vende y cobra.                        |
| Q-V14 | Ventas retroactivas          | 🟡 PENDIENTE  | Sin respuesta.                                                                      |
| Q-V15 | Reportes de ventas           | 🟡 PENDIENTE  | Diferida el 2026-11-09: E5 de Ventas queda para después.                            |
| Q-V16 | Venta bajo costo             | 🟡 PENDIENTE  | Depende de Q-V06; sin objeto si no hay descuentos.                                  |
| Q-V17 | Otros canales de venta       | 🟡 PENDIENTE  | Sin respuesta; Q-V01 acota E1 al mostrador.                                         |

Notas de la tabla:

- **Q-V01 a Q-V05:** la resolución del 2026-11-07 las cita como confirmadas «previamente»; **la fecha de
  esa confirmación original no consta** en el repositorio ni en la resolución.
- **Q-V07 (DEC-V07):** no hay anulación por el flujo ordinario: ni `POST /sales/:id/void`, ni permiso
  `sales:void`, ni movimiento `SALE_VOID`, ni estado `VOIDED`; la venta confirmada es inmutable y
  auditada. Una **venta errónea ya confirmada** se registra como incidencia y se resuelve **fuera del
  sistema**, sin ajuste de stock y sin documento compensatorio (C5). El Vendedor y el Responsable de
  inventario reportan las incidencias y el Administrador las ve (C6), pero **no se definió el flujo ni
  qué ocurre con el stock**. Siguen abiertos: pagos incorrectos, duplicaciones, devoluciones obligatorias
  por ley (requiere contador y asesor legal), cambios frente a la prohibición y reportes de incidencias.
  - Aclaración posterior (2026-11-09, C5 «haz lo recomendable»): el flujo y el tratamiento del stock
    quedan delegados en la recomendación técnica: hoja de incidencias numerada fuera del sistema; el
    Administrador atiende y cierra; la incidencia no mueve stock y el desfase se regulariza en el
    conteo físico ordinario; no se registra una venta compensatoria. Los demás puntos abiertos de esta
    nota no cambian.
- **Q-V09 (DEC-V09):** caja única con apertura, cobros, cierre y arqueo. Respondido el 2026-11-09:
  venta y caja se liberan **juntas** (B1); no se vende sin sesión abierta (B2); abren y cierran el
  Administrador y el Responsable de inventario (B3); fondo inicial obligatorio y de monto libre (B4);
  la diferencia de arqueo se registra con observación obligatoria y sin tolerancia automática (B5); sin
  gastos ni retiros (B6); sin reapertura (B7); QR y transferencias se informan aparte y no afectan el
  efectivo (B8); cada venta guarda quién la hizo y el arqueo es por sesión (B9). Falta el ADR-028
  (propuesta) y la autorización para implementar.
  - Aclaración posterior (2026-11-09) sobre B6 y B7: el responsable reconoció que sin reapertura ni
    movimientos manuales no había vía para corregir un error de cierre, pidió «lo que sea más
    recomendable» y fijó que **solo el Administrador** corrige. B6 y B7 siguen vigentes. La
    recomendación delegada es una corrección append-only de contado, fondo y observación, que no
    modifica la sesión cerrada ni toca ventas o pagos
    ([10-correcciones-de-caja](../propuestas/fase-2-ventas/10-correcciones-de-caja.md)); sus
    subdecisiones menores (SC-1 a SC-6) quedan abiertas.
  - Aclaración posterior (2026-11-09) sobre B4: el monto del fondo se digita en un campo libre. Si el
    cero es válido y si hay tope sigue sin decidir (recomendación: 0 explícito, sin tope).
- **Q-V12 (DEC-V12):** comprobante interno imprimible desde el navegador. Respondido: numeración por
  secuencia con posibles saltos, a consultar con el contador (B10); no se guarda el número de factura
  externa (B11); datos comerciales según la recomendación técnica (nombre comercial, dirección,
  teléfono, NIT opcional, logo opcional), guardados como configuración en la base de datos y **con
  valores reales pendientes de entrega** (C1, C2); A4 por defecto, recordado por navegador (C3);
  reimpresión permitida con marca «Copia» y auditoría (C4). Siguen abiertos el formato del correlativo,
  la identificación del vendedor en el comprobante, quién puede reimprimir y los requisitos del contador.
- **Q-V13:** quién abre y cierra caja está resuelto (B3); quién vende y cobra y los permisos exactos de
  `sales:*` y `cash:*` siguen sin aprobarse (los roles ya se administran por pantalla desde el
  2026-11-10; ver P-46).
- **Q-V08 y Q-V15:** el responsable las dejó **para después** (F4).

### Subdecisiones de Ventas que siguen abiertas

Detalle y alternativas en [08-subdecisiones-pendientes](../propuestas/fase-2-ventas/08-subdecisiones-pendientes.md).

- Excepciones de DEC-V07: SD-A02 pagos incorrectos, SD-A03 duplicaciones, SD-A04 devoluciones
  obligatorias por ley, SD-A05 cambios frente a la prohibición, SD-A07 corrección del stock tras una
  venta errónea y SD-A08 reportes de incidencias. SD-A01 y SD-A06 están respondidas solo en parte (C5,
  C6).
- Comprobante: SD-R01 formato del correlativo, SD-R04 identificación del vendedor, SD-R07 requisitos
  del contador; SD-R03 y SD-R08 con valores reales pendientes; quién reimprime (SD-R06).
- Cambios de pieza: SD-X01 a SD-X07 (diferidos).
- Otras: SD-G01 descuentos, SD-G02 clientes, SD-G03 y SD-G04, SD-G05 reportes (diferidos), SD-G06
  stock negativo en ventas, SD-G07 medios de pago configurables, SD-G09 («precio neto» frente a Q-V03),
  SD-G10 (qué es la Fase 3 tras Q-V02), SD-G12, SD-G13 y SD-G14.
- Respondidas el 2026-11-09: SD-C01 a SD-C08 (B3, B2, B4, B5, B6, B7, B8, B9), SD-R02 (B10), SD-R05
  (C2, C3), SD-R06 (C4), SD-G08 (B11) y SD-G11 (B1).

## Cierre de la Fase 1 (propuestas del informe técnico)

Decisiones nuevas **P-44 a P-47**, propuestas en el
[informe técnico](../informe-tecnico/06-estado-deuda-y-fase-2.md) (OD-05, OD-06 y OD-14) y resueltas o
encaminadas con las respuestas del 2026-11-09.

| ID   | Decisión                                     | Estado          | Lo registrado hoy                                                                         |
| ---- | -------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| P-44 | Reportes y exportaciones al cierre de Fase 1 | 🟢 APROBADA     | Resuelta (2026-11-09): CSV de inventario y movimientos, con el valor del inventario (D1). |
| P-45 | Carga inicial de datos (importador)          | 🟢 APROBADA     | Resuelta (2026-11-09): carga manual, sin importador; la rebanada S11 queda sin construir. |
| P-46 | Gestión de roles por pantalla                | 🟢 IMPLEMENTADA | Resuelta (2026-11-10): API `/roles` y pantalla «Roles», con salvaguardas (ver nota).      |
| P-47 | Acta de aceptación de decisiones por defecto | 🟡 PARCIAL      | Sesión de revisión acordada (2026-11-09), todavía sin fecha.                              |

Notas:

- **P-44:** la exportación de auditoría (P-AUD-1) y el valor de inventario (solo con `costs:read`) no
  se mencionaron y siguen sin decidir.
  - Actualización 2026-11-09 (aclaración D1 = «SÍ»): el reporte mínimo CSV **incluye el valor del
    inventario**, visible **solo con `costs:read`** (regla P-02: el Vendedor no ve costos). Sin decidir:
    valoración a precio de venta, corte a una fecha anterior y la exportación de auditoría (P-AUD-1).
    Recomendación técnica (no regla): costo vigente × saldo a la fecha de exportación, rotulado «a
    costo vigente». Ver
    [RESOLUCIONES-2026-11-09, «Aclaraciones posteriores»](RESOLUCIONES-2026-11-09.md#aclaraciones-posteriores-2026-11-09).
- **P-45:** con 1.000 a 2.000 piezas, la carga manual es costosa y propensa a errores (informe
  técnico); el criterio de cierre «datos reales» se cumple entonces con carga manual.
- **P-46 (resuelta 2026-11-10):** el responsable autorizó la pantalla y la API de gestión de roles
  (permisos `roles:read` y `roles:manage`, solo el Administrador). Salvaguardas técnicas, no reglas de
  negocio nuevas: el Administrador es inmutable; los otros roles de sistema no se renombran ni pierden
  sus permisos base (el seed los volvería a agregar); un rol con usuarios no se elimina; nadie concede
  permisos que no tiene; todo queda auditado. Detalle en `docs/api/API.md` («Roles y permisos»).
  Queda abierto: marcar permisos «exclusivos del Administrador» que la pantalla no deje asignar a otros
  roles (p. ej. `cash:correct` de la propuesta de caja), si el cliente lo pide.
  Antes (2026-11-09): el seed de producción ejecutable sí estaba autorizado (A3 a), pero no la pantalla ni la API
  de roles.
- **P-47:** material para la sesión en
  [REVISION-DECISIONES-POR-DEFECTO](REVISION-DECISIONES-POR-DEFECTO.md).

## Sin respuesta del cliente

No bloquean el código; sí la carga real de datos y la puesta en marcha. Detalle en la sección 6 de
[RESOLUCIONES-2026-11-05.md](RESOLUCIONES-2026-11-05.md): impresora, lector y rollo de etiquetas (B7),
usuarios reales (F1), acceso desde Internet y 2FA (F4/F5), reportes y exportaciones (G), inventario actual
y carga inicial (H), hosting, dominio y copias (I, ver P-18 y P-26), identidad visual (J, ver P-16) y
aceptación y plazos (K).

Actualización 2026-11-09 ([RESOLUCIONES-2026-11-09](RESOLUCIONES-2026-11-09.md)): ya respondieron
parcialmente los administradores reales (dos), el 2FA (no), los reportes mínimos (P-44) y la carga
inicial (manual, P-45). Siguen sin respuesta el acceso desde Internet, el hosting concreto, la fecha de
arranque del sistema, la impresora, el lector y el rollo, la identidad visual y la aceptación y los
plazos.

## Nota de numeración

Al integrar las tres pistas de trabajo hubo IDs repetidos para decisiones distintas. Se conservaron los
IDs que ya citan el código y los ADR aceptados y se renumeraron los demás:

| ID anterior        | ID actual | Decisión                                                           |
| ------------------ | --------- | ------------------------------------------------------------------ |
| P-30 (catálogo S2) | P-33      | Quién fija el precio de venta al crear la pieza.                   |
| S5-01 a S5-06      | P-34–P-39 | Decisiones por defecto de los ingresos v2 (S5), en el mismo orden. |
| P-30 (inventario)  | P-30      | Sin cambio: cambios de pieza (la citan ADR-019 y el código).       |

Los identificadores P-C1 a P-C3 pertenecen al conteo físico (no confundir con las respuestas C1 a C10 del
cuestionario del cliente).

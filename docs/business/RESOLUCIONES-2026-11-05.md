# Decisiones comunicadas por el cliente — 2026-11-05

Resultado de la reunión con el cliente (cuestionario de definición de la Fase 1). Este documento
registra **lo que el cliente respondió**, interpretado contra lo que ya estaba decidido. Lo que quedó
ambiguo o contradictorio **no** se convierte en regla: pasa a
[DECISIONES-ABIERTAS-2026-11-05.md](DECISIONES-ABIERTAS-2026-11-05.md) con opciones.

Estados: 🟢 cerrada · 🔄 cambia una decisión anterior · 🟠 abierta (ver Q-xx) · ⚪ sin respuesta.
«Cerrada» no significa implementada: el orden de construcción está en
[PLAN-DESARROLLO-F1-2026-11.md](../engineering/PLAN-DESARROLLO-F1-2026-11.md).

## 0. Notas de interpretación

- En la primera lista de respuestas, **«P-07 redondeo»** corresponde en el registro a **P-03** (precio
  y redondeo). El **P-07 del registro** (prorrateo por valor y último costo) sigue vigente y se amplía
  en la sección 3.
- **P-22 «no»** se interpreta como respuesta a la pregunta del registro («¿se puede desactivar con
  stock > 0?» → **no**). Es coherente con B11. Si el cliente quiso decir lo contrario, corregir aquí.
- **P-23 y P-24** quedaron en blanco: P-23 se mantiene (retención indefinida); P-24 queda resuelta por
  C1 (sección 2).
- Los bloques **G, H, I, J, K** del cuestionario y las preguntas **F4, F5** no fueron respondidos
  (sección 6).

## 1. Decisiones anteriores — confirmadas o cambiadas

| ID   | Estado | Resultado                                                                                                                               |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| P-02 | 🟢     | El vendedor no ve costos de compra.                                                                                                     |
| P-04 | 🟢     | Categorías de dos niveles (categoría → subcategoría).                                                                                   |
| P-05 | 🟢     | SKU automático correlativo (`SKU-000001`).                                                                                              |
| P-06 | 🟢     | **Depende del proveedor**: si la pieza trae código del proveedor se conserva; si no, el sistema genera uno propio. Ver B5 y Q-10.       |
| P-08 | 🟢     | Sin stock negativo (se reforzará con una restricción en base de datos).                                                                 |
| P-09 | 🟢     | Todo en piezas enteras.                                                                                                                 |
| P-10 | 🔄     | Moneda base Bs, **pero** el cliente compra en dólares: se debe registrar tipo de cambio. Reabre P-10 en lo que toca a compras (Q-07).   |
| P-11 | 🟢     | Numeración correlativa automática de ingresos y conteos.                                                                                |
| P-12 | 🟢     | Tipo de documento de recepción en texto libre.                                                                                          |
| P-19 | 🔄     | **Sesión de 8 horas** (antes 3 h). Falta definir si es fija o con cierre por inactividad (Q-02). Mínimo 10 caracteres y sin 2FA siguen. |
| P-20 | 🟢     | Motivos de ajuste: catálogo predefinido **más** texto libre (E1). Reemplaza «solo texto libre».                                         |
| P-21 | 🟢     | Varios roles por usuario.                                                                                                               |
| P-22 | 🟢     | No se desactiva con stock > 0 (ver nota de interpretación).                                                                             |
| P-23 | 🟢     | Sin cambios: retención indefinida.                                                                                                      |
| P-01 | 🟠     | «El administrador aprueba todo» contradice lo vigente (el responsable aprueba lo suyo) y la matriz F3. Ver Q-01.                        |
| P-17 | 🟠     | «Por número de serie» contradice «toda pieza es individual» y la decisión de no controlar series. Ver Q-03.                             |

## 2. Respuestas al cuestionario

### A. Alcance y operación

| ID  | Estado | Resultado                                                                                                                                                                                                                                                                                                                  |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 🟢     | Flujo real: pedido al proveedor (China u otros) → llegada → **registro de productos** (categoría, subcategoría) → **ingreso de mercadería** → **cálculo de costo** → **ajustes** → **precio de venta** → **conteo físico** → **disposición para venta**. Define el orden de construcción. El paso final se aclara en Q-11. |
| A2  | 🟢     | 150–250 productos (con variantes), 1.000–2.000 piezas, 3–5 usuarios. Volumen pequeño: no hay riesgo de rendimiento; sin optimización especial. Ingresos mensuales: «según proveedores» (sin cifra).                                                                                                                        |
| A3  | 🟢     | Stock único consolidado por variante.                                                                                                                                                                                                                                                                                      |
| A4  | 🟢     | Se trabaja desde PC con lector USB/Bluetooth (se comporta como teclado). No se usa cámara del dispositivo.                                                                                                                                                                                                                 |
| A5  | 🟢     | Sin internet: contingencia manual en papel y transcripción posterior. Sin modo offline.                                                                                                                                                                                                                                    |
| A6  | 🟢     | Bs · DD/MM/AAAA · coma decimal · UTC-4 · español.                                                                                                                                                                                                                                                                          |

### B. Catálogo y codificación

| ID  | Estado | Resultado                                                                                                                                                                                                  |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | 🟢     | Crean y modifican categorías: Administrador y Responsable de inventario.                                                                                                                                   |
| B2  | 🟢     | Delegado al equipo: se aplica la clasificación propuesta en [DECISIONES-ABIERTAS](DECISIONES-ABIERTAS-2026-11-05.md#decisiones-delegadas-que-el-equipo-toma-por-defecto).                                  |
| B3  | 🟢     | Toda pieza es individual; las piezas únicas son variantes con stock 1. Sin combos.                                                                                                                         |
| B4  | 🟢     | Delegado al equipo (propuesta de nomenclatura en el mismo apartado).                                                                                                                                       |
| B5  | 🟢     | **Ambas opciones**: se conserva el código del proveedor cuando existe (el proveedor de China lo envía) y se genera código propio cuando no existe. La etiqueta propia lleva solo el SKU. Detalles en Q-10. |
| B6  | 🟢     | Sin QR en la Fase 1.                                                                                                                                                                                       |
| B7  | ⚪     | Impresora, lector y papel **aún sin definir**. Hay piezas muy pequeñas donde quizá no quepa una etiqueta. En la etiqueta solo va el SKU. Ver Q-10.                                                         |
| B8  | 🔄     | **Fotografías de producto** (antes excluidas: P-14). Requiere almacenamiento de archivos. Ver Q-09.                                                                                                        |
| B9  | 🟢     | Sin quilataje ni pesaje: todo se vende por ítem. Refuerza P-27.                                                                                                                                            |
| B10 | 🟢     | Stock mínimo por variante, valor inicial 0 (desactivado), alerta si stock ≤ mínimo; lo modifica el Responsable de inventario.                                                                              |
| B11 | 🟢     | Para descontinuar: ajuste de salida a cero y luego desactivar. La eliminación física de fichas sin movimientos es solo del Administrador.                                                                  |

### C. Proveedores e ingresos

| ID  | Estado | Resultado                                                                                                                                                                                                                                                  |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 🟢     | Pieza no registrada: se carga con datos mínimos (categoría, nombre, costo, cantidad) y se completa después. **No queda bloqueada**: pasa como un ítem más. Cierra P-24. El precio puede quedar en 0 (D9: no se podrá vender en Fase 2 hasta tener precio). |
| C2  | 🟢     | Diferencia entre cantidad documentada y física: justificación obligatoria en texto libre. Sin módulo de reclamos.                                                                                                                                          |
| C3  | 🟢     | Quien registra el ingreso puede confirmarlo.                                                                                                                                                                                                               |
| C4  | 🟢     | Corrección posterior a la confirmación: solo con un ajuste de inventario. Sin «anular ingreso».                                                                                                                                                            |
| C5  | 🟢     | Cada entrega parcial es un ingreso independiente; puede repetir el número de comprobante del proveedor.                                                                                                                                                    |
| C6  | 🟢     | Fecha del documento editable hasta 30 días hacia atrás; la fecha de auditoría es siempre la real.                                                                                                                                                          |
| C7  | 🔄     | Compras en dólares: **tipo de cambio, costo de aduanización, comisiones, costo total y precio por producto**. Reabre P-10 y amplía P-07. Ver sección 3 y Q-07/Q-08.                                                                                        |
| C8  | 🟢     | Delegado al equipo: nombre, contacto «y los necesarios para una buena estructura» (propuesta en el mismo apartado).                                                                                                                                        |
| C9  | 🔄     | **No hay devoluciones, solo cambios.** El diseño debe permitir que el futuro módulo de ventas registre cambios sin descuadrar inventario, stock, conteos ni ajustes. Ver Q-12.                                                                             |
| C10 | 🟢     | Historial de costos consultable desde el producto; sin reportes analíticos.                                                                                                                                                                                |

### D. Costos y precios

| ID     | Estado | Resultado                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1/D2  | 🔄     | **Regla por producto, no por categoría.** El cliente fija el precio de cada ítem según su costo (a veces gana 50 %, a veces hasta 250 %). El sistema ofrece, opcionalmente, **multiplicador** y **regla de redondeo** por producto. Ejemplo dado: costo 97,9 → con multiplicador 114,7 → se redondea a **115 o 120**. Sustituye a «multiplicador por categoría» de P-03. Detalles abiertos en Q-04/Q-05. |
| (P-03) | 🔄     | Redondeo: «al próximo 5 o múltiplo de 10, **siempre hacia arriba**» (204 → 205; 206 → 210). Choca con «al múltiplo más cercano» de D2. Ver Q-04.                                                                                                                                                                                                                                                         |
| D3     | 🟢     | Solo sugerencia visual al cambiar el costo; la modificación es manual.                                                                                                                                                                                                                                                                                                                                   |
| D4     | 🟢     | El Responsable de inventario **solicita**; el Administrador **aprueba**; vigencia inmediata; se permiten aprobaciones masivas; sin umbral por monto. **El Administrador puede modificar precios directamente**, aunque sea quien los cambia. Cierra P-25.                                                                                                                                                |
| D5     | 🟢     | Entidad propia para el historial de precios de venta.                                                                                                                                                                                                                                                                                                                                                    |
| D6     | 🟢     | Un solo precio por variante; sin listas de precios en Fase 1.                                                                                                                                                                                                                                                                                                                                            |
| D7     | 🟢     | El precio registrado es **neto** (antes de impuestos). Los impuestos se tratan en la fase de ventas.                                                                                                                                                                                                                                                                                                     |
| D8     | 🟢     | El vendedor ve solo el precio de venta; Responsable y Administrador ven costo, ganancia y precio. El cliente exige poder **ver la diferencia entre precio de compra/costo y precio de venta** para evaluar ganancias. Medida exacta en Q-06.                                                                                                                                                             |
| D9     | 🟢     | Se permite precio 0 en piezas con stock; no podrán seleccionarse para venta (Fase 2) hasta tener precio válido.                                                                                                                                                                                                                                                                                          |

### E. Ajustes y conteo físico

| ID  | Estado | Resultado                                                                                                                                                                                                                    |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | 🟠     | Catálogo de motivos (Robo, Pérdida, Muestra, Rotura, Error de registro) **más** texto libre: cerrado. El aviso al administrador por ajustes grandes quedó **sin cifras** (Bs __ / __ unidades) y sin canal. Ver Q-01 y Q-14. |
| E2  | 🟢     | Sin estados intermedios (taller, exposición); las salidas temporales son ajustes.                                                                                                                                            |
| E3  | 🟠     | Conteo **por categoría/subcategoría**: cerrado. Si pueden correr varios a la vez, no se respondió (Q-13).                                                                                                                    |
| E4  | 🟢     | Conteo «a ciegas» (sin ver el stock del sistema), un solo operador con lector; lo no encontrado en el sistema se registra como «hallazgo» para regularizar.                                                                  |
| E5  | 🟢     | El avance se guarda pieza por pieza; al volver a entrar se continúa. La sesión pasa a 8 h (P-19).                                                                                                                            |
| E6  | 🟢     | Diferencia entre conteo ciego y sistema → segundo recuento obligatorio de las variantes afectadas antes de aprobar. Aprueba el Responsable **o** el Administrador (ver Q-01).                                                |

### F. Usuarios

| ID  | Estado | Resultado                                                                                                                                                          |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | ⚪     | Usuarios reales sin definir: el cliente evalúa contratar personal. No bloquea el desarrollo (se usan usuarios de demostración).                                    |
| F2  | 🟢     | El Administrador blanquea la clave asignando una temporal; la persona debe cambiarla al entrar. Sin correo.                                                        |
| F3  | 🟠     | Matriz «tal cual el cuestionario». D4 resuelve dos celdas del Responsable (**solicita precio: sí; aprueba precio: no**). Quedan las celdas ❓ del vendedor (Q-15). |

## 3. Compras de importación (respuesta 4 del cliente)

Para la mercadería de **proveedores de China** (y otros del exterior) el cliente necesita registrar, por
cada ingreso:

- por pieza: **foto**, **código del proveedor**, **cantidad**, **precio de compra**;
- por ingreso: **tipo de cambio del dólar**, **costo de aduanización**, **costo de comisiones**;
- resultado: **costo total** de cada pieza «en base a todo»; el **precio de venta** se define luego,
  pieza por pieza, y debe verse la ganancia frente al costo.

Esto amplía P-07 (prorrateo por valor y último costo, ADR-015), que **sigue vigente**: los costos del
ingreso se reparten en proporción al valor de compra; el costo de la pieza es el último costo.
Lo que falta decidir (moneda de la compra, cómo se carga el tipo de cambio, lista de costos) está en
Q-07 y Q-08.

## 4. Lo que cambia respecto de lo ya construido

| Lo existente                                                                        | Cambio por esta reunión                                        |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Sesión fija de 3 h (P-19, ADR-003)                                                  | 8 h.                                                           |
| Ingreso con 3 costos fijos (transporte, embolsado, otros) y solo Bs                 | Dólares con tipo de cambio, aduanización y comisiones.         |
| Multiplicador de precio por categoría (propuesto en P-03; hay una versión de Codex) | Regla por producto/variante con redondeo.                      |
| Sin archivos (API solo JSON)                                                        | Fotos de producto.                                             |
| Motivo de ajuste en texto libre                                                     | Catálogo de motivos + texto libre.                             |
| Tipo de movimiento `CUSTOMER_RETURN` reservado para ventas                          | Se sustituye por movimientos de **cambio** (sin devoluciones). |
| Responsable aprueba sus conteos y ajustes (P-01)                                    | En revisión (Q-01).                                            |
| Conteo con stock visible y alcance libre                                            | Conteo a ciegas, por categoría, con segundo recuento.          |

## 5. Contradicciones detectadas en las respuestas

1. **P-01** — «administrador aprueba todo» frente a E6 «responsable o administrador» y a la matriz
   F3 (responsable ✔ con P-01). → Q-01.
2. **P-17** — «por número de serie» frente a B3 «toda pieza es individual» y P-17 vigente (sin
   series). → Q-03.
3. **Redondeo** — «siempre hacia arriba» (204 → 205) frente a «múltiplo más cercano» (114,7 → 115 o
   120). → Q-04.
4. **Precio por ítem frente a reglas automáticas** — el propio cliente señala que fijar el precio ítem
   por ítem contradice tener multiplicadores; pidió conservar la opción. → Q-05.
5. **C1 frente a D9** — una pieza nueva «pasa como un ítem más» pero con precio 0 no se podrá vender
   en Fase 2. No es una contradicción si «ítem más» se refiere al stock; se deja explícito.
6. **E5 frente a P-19** — el cuestionario habla de 3 h; el cliente fijó 8 h. Se aplica 8 h.

## 6. Sin respuesta

| Bloque | Tema                                                                                    | Necesario antes de…                    |
| ------ | --------------------------------------------------------------------------------------- | -------------------------------------- |
| B7     | Impresora, lector, tamaño de rollo/etiqueta                                             | Imprimir etiquetas reales (no bloquea) |
| F1     | Usuarios reales                                                                         | Producción                             |
| F4/F5  | Acceso desde Internet, 2FA para administradores, cambio de clave en primer ingreso      | Producción                             |
| G1–G6  | Reportes, valor de inventario, alertas, pantalla de inicio, auditoría, exportaciones    | Rebanada de reportes                   |
| H1–H6  | Inventario actual, arranque, etiquetado, proveedores, periodo en paralelo, capacitación | Rebanada de carga inicial              |
| I1–I8  | Hosting, dominio, tolerancia a fallas, copias, soporte                                  | Producción (y Q-09 si se elige R2)     |
| J1–J3  | Identidad visual, entregables, datos personales                                         | Cierre de Fase 1                       |
| K1–K4  | Menú «Ventas», aceptación, fuera de alcance, plazos                                     | Planificación y cierre                 |
| D2     | Tabla de multiplicadores por categoría (sustituida por la regla por producto)           | —                                      |

## 7. Respuestas a las decisiones abiertas (misma fecha)

El usuario respondió las preguntas de [DECISIONES-ABIERTAS-2026-11-05.md](DECISIONES-ABIERTAS-2026-11-05.md).
Estas respuestas prevalecen sobre las secciones anteriores cuando difieren.

| Q    | Respuesta                 | Regla resultante                                                                                                                                                                                                                                                            |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-01 | B · subpregunta a         | **Conteos:** los aprueba el Responsable de inventario o el Administrador. **Ajustes manuales:** los solicita el Responsable y solo los aprueba el Administrador. El stock cambia **únicamente al aprobar** el ajuste.                                                       |
| Q-02 | A                         | Sesión **fija de 8 horas** desde el login, sin extensión por actividad.                                                                                                                                                                                                     |
| Q-03 | A                         | Sin control por número de serie ni por lotes.                                                                                                                                                                                                                               |
| Q-04 | Respuesta propia          | **El cliente pone el precio de venta de cada ítem a mano.** No hay redondeo automático.                                                                                                                                                                                     |
| Q-05 | Descartada                | **Sin multiplicador** (ni global, ni por categoría, ni por producto). Quedan sin efecto la fórmula `× 2` de P-03 y la sugerencia de precio D3; no se construye calculadora.                                                                                                 |
| (D)  | Consecuencia de Q-04/Q-05 | Al fijar el precio, el sistema **muestra**: precio de compra unitario, subtotal de compra, costos adicionales asignados y **costo total** (unitario y del ítem), para que el cliente decida el precio. La ganancia se muestra frente a ese costo (Q-06).                    |
| Q-06 | A                         | Se muestra **Ganancia en Bs** y **% sobre el costo total**; solo con permiso de costos.                                                                                                                                                                                     |
| Q-07 | A · solo dólares          | Cada ingreso declara moneda (Bs o USD) y, si es USD, el tipo de cambio de ese ingreso. Se guarda el precio en USD, el tipo de cambio y el equivalente en Bs. Costos, stock y precios en Bs. Solo dólares (no yuanes).                                                       |
| Q-08 | A · monto                 | Lista abierta de costos por ingreso con tipo (Transporte, Embolsado, Aduanización, Comisiones, Otro; el Administrador puede agregar tipos) y **monto en Bs**. Se reparten por valor (ADR-015).                                                                              |
| Q-09 | C · 9.1 sí                | Fotos **dentro de PostgreSQL**, reducidas, detrás de una interfaz de almacenamiento. Por producto, hasta 5 (una principal), JPG/PNG/WebP hasta 5 MB reducidas a ~1200 px, suben quienes tienen `catalog:manage`, y se puede adjuntar foto al crear una pieza en un ingreso. |
| Q-10 | A · A · A · A             | Etiqueta propia con el SKU para **todas** las piezas; código del proveedor repetido: avisa y no lo guarda como código de barras (la pieza se identifica por SKU); impresión desde el navegador con tamaño de etiqueta configurable.                                         |
| Q-11 | A                         | Sin estado «en preparación»: en la Fase 2 será vendible una variante activa, con precio > 0 y con stock.                                                                                                                                                                    |
| Q-12 | A · 12.1 A                | Una pieza que vuelve en un cambio entra al stock vendible. En la Fase 1 solo se construye la **base** (tipos de movimiento `EXCHANGE_IN`/`EXCHANGE_OUT`, operación atómica de doble movimiento, ADR y pruebas), sin pantallas.                                              |
| Q-13 | B                         | Varios conteos a la vez si sus categorías no se solapan; el sistema lo valida.                                                                                                                                                                                              |
| Q-14 | A                         | Bandeja «Pendientes de aprobación» con contador en el inicio del Administrador; sin correo.                                                                                                                                                                                 |
| Q-15 | A · A · A · A             | El vendedor no captura conteos; ve el inicio sin costos ni valores; la auditoría la ve solo el Administrador; sin roles adicionales por ahora.                                                                                                                              |

**Decisiones de gestión** (G-01, G-02) sin respuesta explícita: el usuario autorizó avanzar sin
restricciones. Se adoptó G-02 A (el trabajo de Codex es **referencia**, no se fusiona) y, para G-01, el
trabajo se apila sobre la punta del PR #4 en la rama `feature/f1-base`; **no se fusiona nada en
`develop` remoto** sin que el usuario lo pida.

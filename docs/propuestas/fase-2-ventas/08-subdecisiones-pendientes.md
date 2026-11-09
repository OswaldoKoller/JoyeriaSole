# 08 · Subdecisiones pendientes de Fase 2 «Ventas» (lista consolidada y priorizada)

Paquete de análisis para revisión · Documento 8 de 8 · Fecha de corte: 2026-11-09.

**Tipo de autorización: SOLO ANÁLISIS.** Ninguna subdecisión de este documento se da por resuelta. Ninguna recomendación es regla. No se implementa nada que dependa de ellas (CLAUDE.md: «Si una tarea depende de una decisión pendiente: detenerse y preguntar»).

Etiquetas: **[CONFIRMADA]**, **[RECOMENDACIÓN TÉCNICA]**, **[PENDIENTE]**.

## 0. ADVERTENCIA LEGAL (leer primero)

| Punto                                        | Texto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué dice la resolución** [CONFIRMADA]      | «Revisar las obligaciones legales aplicables y no asumir que una política comercial excluye cualquier devolución o rectificación exigida por ley.» (resolución §2)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Qué NO se ha hecho**                       | Este análisis **no** revisó la legislación de Bolivia ni emite opinión legal o tributaria. No se afirma qué exige o no exige la ley.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Qué debe hacerse** [RECOMENDACIÓN TÉCNICA] | Consultar **al contador** y **a un asesor legal** antes de cerrar SD-A01 a SD-A05, SD-R01 a SD-R07 y SD-X01 a SD-X06. Temas a consultar (sin asumir respuesta): derechos de la persona consumidora ante producto defectuoso o venta errónea; obligación o no de aceptar devoluciones o rectificaciones; qué documento acredita la venta ante un reclamo; requisitos de numeración, conservación y contenido de un comprobante que no es factura; cómo se rectifica una venta ya cobrada; obligaciones de conservación de registros y de protección de datos si algún día se guardan clientes. |
| **Conflicto con documentos vigentes**        | ADR-019 y C9 dicen «no hay devoluciones, solo cambios» (`ADR-019` líneas 10 y 29; `RESOLUCIONES-2026-11-05`, fila C9). Esa es una **política comercial confirmada**. Si el asesor legal determina que hay devoluciones o rectificaciones obligatorias, esa política no podría excluirlas: habría que crear un ADR nuevo que reemplace la parte correspondiente de ADR-019 (los ADR aceptados no se editan).                                                                                                                                                                                   |
| **Efecto técnico**                           | DEC-V07 prohíbe la anulación por el flujo ordinario. Eso **no** es un permiso para negar una rectificación legal: significa que, de ser obligatoria, debe diseñarse como **proceso especial, aprobado expresamente**, con trazabilidad completa, y no como un botón de anulación improvisado.                                                                                                                                                                                                                                                                                                 |

## 1. Priorización

| Prioridad                     | Criterio                                                                 | Bloquea                                                              |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **P0 · Legal transversal**    | Requiere contador / asesor legal                                         | SD-A01…A05, SD-R-, SD-X-                                             |
| **P1 · Bloquea E1**           | Sin respuesta no se puede diseñar o habilitar la venta                   | E1                                                                   |
| **P2 · Bloquea E3**           | Las 8 subdecisiones de caja (la resolución exige aprobarlas antes de E3) | E3 (y la habilitación de E1 según §3 de `06-roadmap-actualizado.md`) |
| **P3 · Bloquea E4 / E5 / E6** | Definición funcional pendiente                                           | E4, E5, E6                                                           |
| **P4 · Menor**                | Hay propuesta razonable                                                  | Nada en el corto plazo                                               |

Resumen:

| Bloque                                 | IDs             | Prioridad                                                                                      |
| -------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| A · Excepciones de DEC-V07             | SD-A01 … SD-A08 | P0 + P1 (los procesos excepcionales deben estar definidos **antes** de operar con dinero real) |
| C · Caja (8 subdecisiones de DEC-V09)  | SD-C01 … SD-C08 | P2; SD-C02 también P1                                                                          |
| R · Numeración y comprobante (DEC-V12) | SD-R01 … SD-R08 | P1 (SD-R01, SD-R02) y P0 (SD-R03, SD-R07)                                                      |
| X · Cambios de piezas (E4)             | SD-X01 … SD-X07 | P3 + P0                                                                                        |
| G · Otras detectadas                   | SD-G01 … SD-G14 | Mixta                                                                                          |

---

## 2. Bloque A · Excepciones de DEC-V07 (prohibición de anular)

La resolución deja sin definir cinco casos. Deben documentarse como incidencias o procesos especiales y presentarse al responsable. **No implementar mecanismos de reversión sin autorización expresa.**

### SD-A01 · Venta errónea ya confirmada

| Campo                   | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Producto, cantidad o precio equivocado en una venta ya confirmada y cobrada.                                                                                                                                                                                                                                                                                                                                                                              |
| Opciones                | **(a)** No se corrige en el sistema; se documenta una incidencia y se resuelve fuera (por ejemplo, venta nueva compensatoria). **(b)** Proceso especial aprobado: «incidencia» con aprobación, que genera movimientos compensatorios nuevos y trazables, sin tocar la venta original. **(c)** Corrección solo por ajuste de inventario y registro manual del dinero (ver SD-A07). **(d)** Reabrir el debate de anulación controlada (contradice DEC-V07). |
| Pros / contras          | (a) simple, sin código; deja stock y dinero descuadrados hasta que alguien actúe. (b) trazable, auditable; es código nuevo y es un mecanismo de reversión: **exige autorización expresa**. (c) usa algo existente; es una reversión encubierta (SD-A07). (d) contradice la regla confirmada.                                                                                                                                                              |
| [RECOMENDACIÓN TÉCNICA] | Definir primero el **procedimiento operativo** (a) por escrito, con el contador, y decidir sobre (b) solo si el volumen de errores lo justifica tras el piloto (E7). No implementar (b)/(c)/(d) sin orden. Priorizar la prevención (controles de DEC-V07 §2).                                                                                                                                                                                             |
| Bloquea                 | Habilitación de E1 con dinero real (procedimiento mínimo)                                                                                                                                                                                                                                                                                                                                                                                                 |
| Decide                  | Responsable del proyecto, con contador y asesor legal (P0)                                                                                                                                                                                                                                                                                                                                                                                                |

### SD-A02 · Pagos incorrectos

| Campo                   | Contenido                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Medio de pago mal registrado (efectivo en vez de QR), pago mixto mal repartido, monto o vuelto erróneo, ya confirmada la venta.                                                                                                                                                                                                       |
| Opciones                | **(a)** Sin corrección en el sistema; se anota como incidencia y se concilia en el arqueo (la diferencia se explica). **(b)** Corrección del medio de pago como registro nuevo vinculado a la venta (no modifica importes de la venta). **(c)** Impedir el error con más control previo (confirmación de pagos, resumen en pantalla). |
| Pros / contras          | (a) sin mecanismo; el arqueo muestra diferencias sin forma de reclasificar. (b) corrige la conciliación; es una modificación indirecta de lo cobrado: requiere aprobación expresa y define si afecta el efectivo esperado. (c) reduce frecuencia, no elimina.                                                                         |
| [RECOMENDACIÓN TÉCNICA] | Reforzar (c) en E1 y definir en el procedimiento de arqueo cómo se explica la diferencia (SD-C04); estudiar (b) solo si el responsable lo pide.                                                                                                                                                                                       |
| Bloquea                 | Diseño de E1 (qué se muestra antes de confirmar) y de E3 (conciliación)                                                                                                                                                                                                                                                               |
| Decide                  | Responsable del proyecto; contador para el criterio de conciliación                                                                                                                                                                                                                                                                   |

### SD-A03 · Duplicaciones

| Campo                              | Contenido                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                                | Dos ventas iguales por error humano (el operador cobra dos veces la misma venta de forma deliberada o por confusión) o «duplicaciones históricas» a pesar de la idempotencia.                               |
| Distinción [RECOMENDACIÓN TÉCNICA] | La **idempotencia** (mismo identificador de solicitud) evita el duplicado técnico por reintento o doble clic. **No** evita que una persona registre dos veces la misma venta con dos solicitudes distintas. |
| Opciones                           | **(a)** Proceso excepcional aprobado (ver SD-A01). **(b)** Aviso de posible duplicado (misma combinación de líneas y total en pocos minutos) como control previo, sin bloquear. **(c)** Ninguna acción.     |
| [RECOMENDACIÓN TÉCNICA]            | (b) como control previo es compatible con DEC-V07 (previene, no revierte); la corrección real sigue en SD-A01.                                                                                              |
| Bloquea                            | Nada si se acepta (c); (b) amplía E1                                                                                                                                                                        |
| Decide                             | Responsable del proyecto                                                                                                                                                                                    |

### SD-A04 · Devoluciones obligatorias por ley

| Campo                   | Contenido                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Casos en que la ley exigiría aceptar una devolución o rectificación. Ver §0.                                                                                                                                                       |
| Opciones                | **(a)** Consulta legal y definición de un proceso especial de devolución. **(b)** Mantener «solo cambios» sin consulta (riesgo legal).                                                                                             |
| Pros / contras          | (a) es el único camino responsable; puede obligar a un ADR que reemplace parte de ADR-019 y a nuevo diseño (devolución de dinero, caja, stock). (b) ahorra trabajo; la advertencia de la resolución dice expresamente no asumirlo. |
| [RECOMENDACIÓN TÉCNICA] | (a), antes de E1 con dinero real. No diseñar la devolución hasta tener el dictamen: depende de qué exige la ley.                                                                                                                   |
| Bloquea                 | Habilitación de E1 con dinero real; E4                                                                                                                                                                                             |
| Decide                  | Responsable del proyecto + contador + asesor legal (P0)                                                                                                                                                                            |

### SD-A05 · Cambios de piezas frente a la prohibición

| Campo                   | Contenido                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Qué                     | El cambio de pieza (ADR-019) revierte en parte una venta (la pieza vuelve al stock y sale otra). Es un proceso permitido por ADR-019 y distinto de la anulación, pero comparte la «huella» de una reversión. |
| Opciones                | **(a)** E4 define el cambio como proceso distinto, con límites claros, vinculado a la venta y sin tocarla. **(b)** Prohibir cambios hasta definir E4.                                                        |
| [RECOMENDACIÓN TÉCNICA] | (a) con la advertencia de que el cambio **no** puede usarse para neutralizar una venta (misma pieza ↔ misma pieza; ADR-019 ya exige variantes distintas). Resolver SD-X01…SD-X07.                            |
| Bloquea                 | E4                                                                                                                                                                                                           |
| Decide                  | Responsable del proyecto                                                                                                                                                                                     |

### SD-A06 · Registro y aprobación de incidencias [detectada]

| Campo                   | Contenido                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Si hay procesos especiales (SD-A01…A05), ¿quién los registra, quién los aprueba y dónde queda el registro?                                                                                                                                                                |
| Opciones                | **(a)** Fuera del sistema (hoja o documento firmado). **(b)** Una entidad «incidencia» de solo lectura/seguimiento en el sistema, sin efecto sobre stock ni dinero (solo trazabilidad). **(c)** Incidencia con efecto (equivale a reversión: exige autorización expresa). |
| [RECOMENDACIÓN TÉCNICA] | Empezar con (a) y valorar (b) tras el piloto; (c) solo con orden expresa. Aplicar segregación: quien cobra no aprueba (P-43, OD-14).                                                                                                                                      |
| Bloquea                 | Habilitación de E1 con dinero real (necesita al menos (a))                                                                                                                                                                                                                |
| Decide                  | Responsable del proyecto                                                                                                                                                                                                                                                  |

### SD-A07 · Corrección del stock tras una venta errónea sin anulación [detectada]

| Campo                            | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pregunta                         | Si una venta errónea no se puede anular, el stock queda descontado de más. ¿Un **ajuste de inventario** aprobado (motivo «Error de registro», `ADR-017` línea 12) sería una **reversión encubierta**?                                                                                                                                                                                                                                                              |
| Análisis [RECOMENDACIÓN TÉCNICA] | **Sí, funcionalmente lo sería** si se usa para deshacer una venta concreta: devuelve la pieza al stock sin dejar enlazada la venta, y el dinero quedaría sin corrección; el stock cuadra y la contabilidad de la caja no. La resolución prohíbe «mecanismos alternativos de reversión sin autorización expresa» y «crear mecanismos de anulación encubiertos» (§9). ADR-019 (línea 70) ya admite corregir un cambio con un ajuste: ese antecedente debe revisarse. |
| Opciones                         | **(a)** Prohibir ajustes que "corrijan" una venta: los ajustes solo por causas físicas (conteo, pérdida, rotura). **(b)** Permitir ajuste pero obligar a referenciar la incidencia de SD-A06 (trazabilidad explícita), con aprobación distinta de quien vendió. **(c)** Dejarlo sin regla.                                                                                                                                                                         |
| Pros / contras                   | (a) coherente con DEC-V07; deja la pieza física fuera del sistema hasta que haya proceso (SD-A01), y el conteo detectará la diferencia. (b) cuadra stock con trazabilidad; es una excepción que **requiere autorización expresa**. (c) deja la puerta abierta a anulaciones de hecho.                                                                                                                                                                              |
| [RECOMENDACIÓN TÉCNICA]          | (a) por defecto hasta decisión; si el responsable aprueba una vía, que sea (b), nunca (c). Ver el efecto en conteos (ADR-021): una pieza física presente sin saldo la detecta el conteo y se regulariza por hallazgo, no por «deshacer venta».                                                                                                                                                                                                                     |
| Bloquea                          | SD-A01; instrucciones de capacitación (E7)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Decide                           | Responsable del proyecto (con el equipo técnico)                                                                                                                                                                                                                                                                                                                                                                                                                   |

### SD-A08 · Visibilidad y reportes de incidencias [detectada]

| Campo                   | Contenido                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Qué reportes ven las excepciones: ajustes posteriores a ventas, reimpresiones, diferencias de caja, ventas con incidencia. Sustituye al «reporte de anulaciones por usuario» de `06` (obsoleto, matriz C-07). |
| Opciones                | **(a)** Solo auditoría existente (`/auditoria`, solo Administrador). **(b)** Reportes específicos en E5.                                                                                                      |
| [RECOMENDACIÓN TÉCNICA] | (a) en E1; (b) cuando E5 se confirme (Q-V15).                                                                                                                                                                 |
| Bloquea                 | E5                                                                                                                                                                                                            |
| Decide                  | Responsable del proyecto                                                                                                                                                                                      |

---

## 3. Bloque C · Las 8 subdecisiones de caja (DEC-V09)

La resolución exige **aprobación específica** de cada una. **Elegir «caja única» no las aprueba.** Todas son P2; SD-C02 es además P1 por el conflicto de orden (`06-roadmap-actualizado.md` §3).

### SD-C01 · Roles que pueden abrir y cerrar caja

| Campo                   | Contenido                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opciones                | **(a)** Solo Administrador. **(b)** Administrador y Responsable de inventario. **(c)** Cualquier usuario con un permiso específico de caja (incluido Vendedor o un rol «Cajero»). **(d)** Abre cualquiera autorizado, cierra solo Responsable/Administrador.                                                                                    |
| Pros / contras          | (a) máximo control; cuello de botella si no está. (b) alinea con la regla compartida de autorización (RESOLUCIONES-2026-11-05, §7), que **no cubre ventas** y no debe extenderse por analogía. (c) flexible; riesgo de fraude. (d) separación apertura/cierre; más reglas. Un rol «Cajero» requiere seed o gestión de roles (DT-ARQ-07, OD-05). |
| [RECOMENDACIÓN TÉCNICA] | (d) o (b) con permisos separados `cash:open`/`cash:close` (propuesta de nombres, no aprobados).                                                                                                                                                                                                                                                 |
| Bloquea                 | E3; si se elige la alternativa B del §3 del roadmap, bloquea E1                                                                                                                                                                                                                                                                                 |
| Decide                  | Responsable del proyecto                                                                                                                                                                                                                                                                                                                        |

### SD-C02 · Venta sin sesión abierta

| Campo                   | Contenido                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opciones                | **(a)** No se permite vender sin sesión abierta. **(b)** Se permite y la venta queda «sin sesión» (marcada). **(c)** Se permite solo a Administrador con motivo.                                                                                                                 |
| Consecuencias           | (a) integridad total; si la caja olvidó abrirse, no se puede vender (exige cultura operativa y contingencia). (b) las ventas sin sesión no entran en ningún arqueo y no se pueden conciliar después (ver roadmap §3.2). (c) caso excepcional controlado; sigue sin conciliación. |
| [RECOMENDACIÓN TÉCNICA] | (a) para ventas reales. Si el responsable elige (b) o (c) debe aceptar por escrito que esas ventas no se concilian.                                                                                                                                                              |
| Bloquea                 | E1 con dinero real; esquema de `sales.cash_session_id` (nullable o no)                                                                                                                                                                                                           |
| Decide                  | Responsable del proyecto                                                                                                                                                                                                                                                         |

### SD-C03 · Fondo inicial y sus restricciones

| Campo                   | Contenido                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opciones                | **(a)** Monto libre, obligatorio (puede ser 0). **(b)** Monto fijo configurable por el Administrador. **(c)** Debe coincidir con el efectivo contado al cierre anterior (arrastre). |
| Pros / contras          | (a) simple. (b) uniforme. (c) detecta faltantes entre turnos; exige reglas de arrastre cuando hay retiros.                                                                          |
| [RECOMENDACIÓN TÉCNICA] | (a) con validación de monto ≥ 0 y tope razonable configurable; (c) como control adicional si el responsable lo quiere.                                                              |
| Bloquea                 | E3                                                                                                                                                                                  |
| Decide                  | Responsable del proyecto                                                                                                                                                            |

### SD-C04 · Tolerancia de diferencia

| Campo                   | Contenido                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opciones                | **(a)** Ninguna: toda diferencia se registra y requiere nota. **(b)** Umbral en Bs: bajo el umbral se registra sin acción; sobre el umbral requiere aprobación/explicación. **(c)** Bloquear el cierre sobre cierto monto. |
| [RECOMENDACIÓN TÉCNICA] | (a)/(b): **registrar siempre** la diferencia (la resolución lo exige); no bloquear el cierre (c) para no perder datos. El valor del umbral lo fija el responsable.                                                         |
| Bloquea                 | E3                                                                                                                                                                                                                         |
| Decide                  | Responsable del proyecto; contador para el tratamiento contable                                                                                                                                                            |

### SD-C05 · Gastos y retiros

| Campo                   | Contenido                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | `cash_movements` existen en la propuesta «cuando se autoricen».                                                                                                                                             |
| Opciones                | **(a)** No en el MVP (solo cobros de ventas y fondo). **(b)** Retiros y gastos con motivo obligatorio, usuario y autorización. **(c)** Solo retiros (depósito al banco) sin gastos.                         |
| Pros / contras          | (a) menos alcance; el efectivo esperado ignorará gastos reales y generará diferencias. (b) arqueo real; más permisos y reglas, y se acerca a contabilidad (CLAUDE.md prohíbe contabilidad). (c) intermedio. |
| [RECOMENDACIÓN TÉCNICA] | (c) o (b) mínimo, con motivo obligatorio y sin categorías contables.                                                                                                                                        |
| Bloquea                 | E3 (diseño de `cash_movements`)                                                                                                                                                                             |
| Decide                  | Responsable del proyecto                                                                                                                                                                                    |

### SD-C06 · Reapertura de caja cerrada

| Campo                   | Contenido                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Opciones                | **(a)** Nunca se reabre: los errores se corrigen con un nuevo movimiento de caja en la sesión siguiente. **(b)** Reapertura por Administrador con motivo, dentro de un plazo, mientras no se abra otra sesión. **(c)** Reapertura sin límite.                      |
| Pros / contras          | (a) preserva el cierre como dato histórico (la resolución dice «mantener los datos del cierre como información histórica»); exige un camino para correcciones. (b) práctico; modifica el estado de un cierre y afecta la inmutabilidad. (c) rompe la trazabilidad. |
| [RECOMENDACIÓN TÉCNICA] | (a). Si el responsable quiere (b), debe ser un registro nuevo auditado, nunca editar los datos del cierre. Es una forma de reversión: **autorización expresa**.                                                                                                    |
| Bloquea                 | E3                                                                                                                                                                                                                                                                 |
| Decide                  | Responsable del proyecto                                                                                                                                                                                                                                           |

### SD-C07 · Cierre con QR o transferencia pendiente de conciliación

| Campo                   | Contenido                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Los cobros QR y por transferencia no forman parte del efectivo a contar, pero pueden no haberse verificado en el banco al cerrar. No hay integración bancaria (CLAUDE.md).                                                            |
| Opciones                | **(a)** El cierre solo calcula efectivo; QR/transferencia se listan aparte como «declarados». **(b)** El cierre exige marcar cada QR/transferencia como verificado. **(c)** Conciliación posterior fuera de la sesión (otro proceso). |
| [RECOMENDACIÓN TÉCNICA] | (a) en el MVP, con campo de referencia obligatorio para QR/transferencia y reporte aparte; (b)/(c) dependen de cómo concilie el negocio con el banco: preguntar al contador.                                                          |
| Bloquea                 | E3; E7 (conciliación)                                                                                                                                                                                                                 |
| Decide                  | Responsable del proyecto + contador                                                                                                                                                                                                   |

### SD-C08 · Responsabilidad de cada vendedor en caja compartida

| Campo                   | Contenido                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Una caja lógica compartida por varios usuarios: ¿quién responde por una diferencia?                                                                                                                                                                                    |
| Opciones                | **(a)** Responsable es quien abre/cierra la sesión; las ventas conservan su vendedor para trazabilidad. **(b)** Cada vendedor tiene "subtotal" por sesión y el arqueo muestra el esperado por vendedor. **(c)** Turnos: una sesión por turno con un único responsable. |
| [RECOMENDACIÓN TÉCNICA] | (a) + reporte de cobros por vendedor dentro de la sesión (información, no responsabilidad automática). La responsabilidad disciplinaria es decisión del negocio, no del sistema.                                                                                       |
| Bloquea                 | E3; matriz de permisos                                                                                                                                                                                                                                                 |
| Decide                  | Responsable del proyecto                                                                                                                                                                                                                                               |

---

## 4. Bloque R · Numeración y comprobante (DEC-V12)

El mecanismo (impresión desde el navegador, formato configurable) es [CONFIRMADA]. Lo siguiente está [PENDIENTE]. **No introducir garantía de numeración continua sin decisión específica.**

### SD-R01 · Formato definitivo del correlativo

| Campo                   | Contenido                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opciones                | **(a)** `VTA-000001` (patrón de `06`, consistente con ING/AJ/CNT). **(b)** Con año (`VTA-2026-000001`). **(c)** Con prefijo de caja/establecimiento. |
| [RECOMENDACIÓN TÉCNICA] | (a) por simplicidad (una caja, un local); (b) si el negocio quiere reiniciar por año, con las consecuencias de unicidad.                             |
| Bloquea                 | E1 (formato del comprobante)                                                                                                                         |
| Decide                  | Responsable del proyecto; contador (P0)                                                                                                              |

### SD-R02 · Política sobre saltos de numeración

| Campo                   | Contenido                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hecho                   | Hoy los documentos usan `autoincrement()`, que deja huecos si una transacción se revierte (DT-ARQ-10; `04` §8.3).                                                                                                                  |
| Opciones                | **(a)** Se aceptan saltos (secuencia). **(b)** Sin saltos: contador transaccional (`document_counters` con `FOR UPDATE`), que serializa solo la emisión del número. **(c)** Sin saltos y con registro de números "perdidos".       |
| Pros / contras          | (a) simple; un salto puede dar la impresión de venta oculta. (b) correlativo continuo sin huecos por rollback; aun así no garantiza que no existan números sin comprobante impreso. (c) más explicable ante auditoría; más código. |
| [RECOMENDACIÓN TÉCNICA] | Decidir **antes** de la migración de `sales`, porque cambiar después implica renumerar. La resolución advierte no ofrecer garantía de continuidad sin decisión. Preguntar al contador si lo exige (SD-R07).                        |
| Bloquea                 | E1 (modelo de datos)                                                                                                                                                                                                               |
| Decide                  | Responsable del proyecto; contador (P0)                                                                                                                                                                                            |

### SD-R03 · Datos obligatorios del negocio en el comprobante

| Campo                   | Contenido                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Razón social/nombre comercial, NIT, dirección, teléfono, etc. La resolución propone «identificación comercial» y logo si se proporciona.                                        |
| Opciones                | **(a)** Mínimo: nombre comercial + leyendas. **(b)** Completo según indique el contador.                                                                                        |
| [RECOMENDACIÓN TÉCNICA] | Preguntar al contador qué datos son obligatorios o aconsejables en un documento interno que no es factura; evitar que el comprobante pueda confundirse con un documento fiscal. |
| Bloquea                 | E1 (plantilla)                                                                                                                                                                  |
| Decide                  | Responsable del proyecto + contador (P0)                                                                                                                                        |

### SD-R04 · Identificación del vendedor

| Opciones                | **(a)** Nombre completo del usuario. **(b)** Iniciales o código. **(c)** No se imprime (consta en el sistema). |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| [RECOMENDACIÓN TÉCNICA] | (a) o (b); es dato de trazabilidad y de reclamos. Decisión de privacidad del equipo.                           |
| Bloquea                 | E1 (plantilla)                                                                                                 |
| Decide                  | Responsable del proyecto                                                                                       |

### SD-R05 · Configuración del formato por usuario o por establecimiento

| Opciones                | **(a)** Por establecimiento (única configuración para todos, guardada en el servidor). **(b)** Por usuario o por equipo (preferencia en el navegador, `localStorage`). **(c)** Selección en cada impresión (sin persistir). |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pros / contras          | (a) uniforme; requiere almacenamiento y permiso de configuración. (b) varias impresoras en distintos puestos; sin persistencia en el servidor. (c) cero estado; incómodo.                                                   |
| [RECOMENDACIÓN TÉCNICA] | (b) o (c) para el MVP; (a) si hay una sola impresora y se quiere uniformidad. Si se persiste en servidor, es un cambio de modelo (tabla de configuración).                                                                  |
| Bloquea                 | E1 (diseño de configuración)                                                                                                                                                                                                |
| Decide                  | Responsable del proyecto                                                                                                                                                                                                    |

### SD-R06 · Reimpresión y su auditoría

| Campo                   | Contenido                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmado [CONFIRMADA] | La reimpresión no modifica importes históricos ni crea una venta.                                                                       |
| Pendiente               | ¿Se registra cada reimpresión (quién, cuándo)? ¿Se marca «Copia»? ¿Quién puede reimprimir?                                              |
| Opciones                | **(a)** Sin registro. **(b)** Registro en auditoría de cada reimpresión. **(c)** Marca visible «Copia / reimpresión n.º N».             |
| [RECOMENDACIÓN TÉCNICA] | (b)+(c): previene el uso de copias como si fueran originales (riesgo de reclamos fraudulentos). Aumenta el volumen de auditoría (bajo). |
| Bloquea                 | E1                                                                                                                                      |
| Decide                  | Responsable del proyecto                                                                                                                |

### SD-R07 · Requisitos del contador

| Campo                   | Contenido                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Qué                     | Todo requisito de numeración, conservación, contenido o leyendas que imponga el contador o la normativa aplicable a un documento interno. |
| [RECOMENDACIÓN TÉCNICA] | Consulta formal por escrito antes de congelar la plantilla y la numeración. Ver §0. No se asume ningún requisito.                         |
| Bloquea                 | SD-R01, SD-R02, SD-R03                                                                                                                    |
| Decide                  | Contador y asesor legal; el responsable acepta (P0)                                                                                       |

### SD-R08 · Logo e identidad visual [detectada]

| Opciones                | **(a)** Sin logo (texto) hasta que el cliente lo entregue (P-16). **(b)** Logo subido por Administrador (almacenamiento: reutilizar el esquema de fotos o archivo estático). |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RECOMENDACIÓN TÉCNICA] | (a) en el MVP; el logo en papel térmico de 58 mm tiene resolución limitada (pruebas con impresora real).                                                                     |
| Bloquea                 | Nada en el corto plazo                                                                                                                                                       |
| Decide                  | Responsable del proyecto                                                                                                                                                     |

---

## 5. Bloque X · Cambios de piezas (E4, pendiente de definición)

Un cambio **no es** una anulación. El mecanismo técnico de ADR-019 existe. Todo lo siguiente es [PENDIENTE]. Origen: Q-V08 y P-30.

| ID         | Pregunta                                            | Opciones                                                                                     | Pros / contras                                                                                                   | [RECOMENDACIÓN TÉCNICA]                                                                                                          | Bloquea | Decide                 |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------- |
| **SD-X01** | ¿Quién registra los cambios? (P-30)                 | (a) Vendedor; (b) Responsable/Admin (hoy: `inventory:exchange`); (c) Vendedor con aprobación | (a) ágil, riesgo de fraude (cobro + cambio); (b) control, cuello de botella; (c) segregación                     | (c) o (b) mientras no haya arqueo funcionando; el permiso nuevo ligado a una venta (propuesto `sales:exchange`) no está aprobado | E4      | Responsable            |
| **SD-X02** | Diferencia de precio y de dinero                    | (a) paga el cliente; (b) saldo a favor; (c) reintegro                                        | (c) es devolución de dinero: contradice C9 y toca SD-A04; (b) crea saldo (cercano a crédito, excluido por Q-V05) | (a) como única vía hasta el dictamen legal                                                                                       | E4, E3  | Responsable + contador |
| **SD-X03** | ¿Se cambia la misma pieza por otra igual (defecto)? | (a) sí; (b) no                                                                               | ADR-019 exige variantes distintas (422). (a) exige cambiar ADR-019 por uno nuevo                                 | Revisar con ejemplos reales; si el defecto se resuelve así, no usar el cambio para neutralizar una venta                         | E4      | Responsable            |
| **SD-X04** | Cambios de ventas anteriores al sistema             | (a) sí; (b) no                                                                               | (a) no hay venta de origen que vincular                                                                          | (b)                                                                                                                              | E4      | Responsable            |
| **SD-X05** | Revisión de la pieza devuelta antes de venderse     | (a) vuelve al stock vendible (12.1 A, vigente); (b) pasa por revisión                        | (b) añade un estado intermedio, que fue descartado                                                               | Mantener (a) salvo decisión                                                                                                      | E4      | Responsable            |
| **SD-X06** | Corrección de un cambio erróneo                     | (a) cambio inverso (ADR-019); (b) ajuste aprobado (ADR-019); (c) prohibir                    | (a)/(b) son reversiones permitidas por un ADR aceptado; DEC-V07 pide cautela                                     | Tratar junto con SD-A07; no ampliar sin orden                                                                                    | E4      | Responsable            |
| **SD-X07** | Límite de tiempo para cambiar [detectada]           | (a) sin límite; (b) N días                                                                   | (b) es política comercial no documentada                                                                         | No inventar un plazo: preguntar                                                                                                  | E4      | Responsable            |

---

## 6. Bloque G · Otras subdecisiones detectadas o heredadas

| ID                      | Pregunta                                                                                                   | Opciones                                                                                           | [RECOMENDACIÓN TÉCNICA]                                                                                                                                                  | Bloquea                     | Decide                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | -------------------------- |
| **SD-G01** (Q-V06)      | ¿Descuentos?                                                                                               | (a) Ninguno; (b) por línea o total con permiso, tope y motivo                                      | (a) en E1; confirmar por escrito «sin descuentos»; sin descuentos, Q-V16 queda sin objeto                                                                                | E1 (confirmación), E6       | Responsable                |
| **SD-G02** (Q-V10)      | ¿Se registran clientes?                                                                                    | (a) venta anónima; (b) maestro de clientes; (c) nada                                               | (a). (b) exige política de datos personales; el comprobante propuesto no incluye cliente                                                                                 | E6                          | Responsable + asesor legal |
| **SD-G03** (Q-V13)      | ¿El Vendedor ve las ventas de otros? ¿Existe cajero? ¿Comisiones?                                          | Por permiso                                                                                        | Vendedor ve las suyas; comisiones fuera de alcance salvo pedido                                                                                                          | E1 (matriz de permisos)     | Responsable                |
| **SD-G04** (Q-V14)      | Ventas retroactivas tras una caída de conexión                                                             | (a) no hay (la fecha es real); (b) retroactivas hasta N días por Administrador con motivo          | Con DEC-V07 una venta retroactiva errónea es irreversible: (a) en E1; y escribir la guía de contingencia en papel (DT-DOC-08)                                            | E1                          | Responsable                |
| **SD-G05** (Q-V15)      | Reportes de ventas                                                                                         | Lista                                                                                              | Ventas por día, vendedor, medio y producto; cobros por sesión; sin "anuladas"                                                                                            | E5                          | Responsable                |
| **SD-G06** (Q-V11)      | ¿Se mantiene P-08 (no vender sin stock) en ventas?                                                         | (a) mantener; (b) vender y regularizar                                                             | (a); el CHECK de BD ya lo impone. (b) rompe el CHECK y los conteos, requiere ADR                                                                                         | E1                          | Responsable                |
| **SD-G07** (Q-V04)      | ¿Lista de medios de pago fija o configurable? ¿Qué campos exige cada uno (referencia de transferencia/QR)? | (a) fija de tres; (b) catálogo configurable                                                        | (b) con referencia obligatoria para QR/transferencia (el patrón existe en tipos de costo)                                                                                | E1                          | Responsable                |
| **SD-G08** (Q-V02)      | ¿Se guarda un campo opcional con el número de factura emitida en el sistema externo?                       | (a) sí (`invoice_reference`); (b) no                                                               | (b) hasta que haya integración o un proceso; (a) es solo una nota                                                                                                        | E1                          | Responsable + contador     |
| **SD-G09** (Q-V03 / D7) | ¿Q-V03 reemplaza la lectura de D7 «precio neto»?                                                           | (a) sí; (b) hay que documentar otra interpretación                                                 | Confirmar y dejarlo escrito en una resolución (no editar ADR-018). El contador debe validar que cobrar el precio registrado es admisible mientras la factura sea externa | E1 (textos del comprobante) | Responsable + contador     |
| **SD-G10**              | Qué es la Fase 3 tras Q-V02                                                                                | (a) eliminarla; (b) integración con el sistema externo de facturación; (c) mantener el SIN directo | No planificar. `ARCHITECTURE.md:107` dice SIN directo: contradice Q-V02                                                                                                  | Planificación               | Responsable                |
| **SD-G11**              | Orden E1/E3 (A/B/C)                                                                                        | Ver `06-roadmap-actualizado.md` §3                                                                 | Decisión del responsable; ver ese documento                                                                                                                              | E1                          | Responsable                |
| **SD-G12**              | Operación cuando no hay conexión (A5: papel y transcripción)                                               | (a) papel y transcripción posterior; (b) no vender                                                 | Con inmutabilidad total, una transcripción errónea no se corrige: necesita doble revisión y guía de contingencia                                                         | E1 / E7                     | Responsable                |
| **SD-G13**              | Pruebas con operaciones reales (E7): ¿cómo se hacen sin anulación?                                         | (a) en BD de pruebas aparte; (b) en producción con ventas reales supervisadas                      | En producción cada venta descuenta stock real: no hay vuelta atrás ordinaria. (a) para todo ensayo; (b) solo con ventas genuinas                                         | E7                          | Responsable                |
| **SD-G14** (Q-V17)      | Otros canales de venta                                                                                     | (a) solo mostrador; (b) otros                                                                      | (a); Q-V01 ya acota E1                                                                                                                                                   | Nada                        | Responsable                |

---

## 7. Orden sugerido de resolución [RECOMENDACIÓN TÉCNICA]

| Paso | Qué                                                                      | Por qué primero                                               |
| ---: | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
|    1 | Consulta al contador y asesor legal (§0): SD-A04, SD-R07, SD-G09, SD-C07 | Condiciona todo lo demás                                      |
|    2 | SD-A01, SD-A06, SD-A07: procedimiento mínimo de errores                  | Sin anulación, hay que saber qué hacer antes del primer error |
|    3 | SD-G11 + SD-C02 (orden de E1/E3 y venta sin sesión)                      | Define el esquema de `sales`                                  |
|    4 | SD-R01, SD-R02, SD-R03, SD-R04, SD-R06                                   | Bloquean la plantilla y la numeración de E1                   |
|    5 | SD-G01, SD-G03, SD-G04, SD-G06, SD-G07, SD-G08                           | Detalles de E1                                                |
|    6 | SD-C01, SD-C03…SD-C08                                                    | Cierran E3                                                    |
|    7 | SD-X01…SD-X07, SD-G05                                                    | E4 y E5                                                       |

Cada respuesta debe registrarse como resolución fechada y reflejarse en `PENDIENTES.md` (acción A-02 de la matriz); las que sean estructurales requieren ADR antes del código.

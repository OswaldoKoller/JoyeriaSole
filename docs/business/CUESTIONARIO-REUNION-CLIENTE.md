# Cuestionario de definición con el cliente — Fase 1

> **Superado por [RESOLUCIONES-2026-11-05](RESOLUCIONES-2026-11-05.md) y por el estado vigente de [PENDIENTES.md](PENDIENTES.md).** Es el cuestionario previo a la reunión del 2026-11-05; su sección 1 («Ya está decidido») ya no es vigente (sesión de 3 horas, motivos de ajuste libres, solo bolivianos y precio base `× 2`). No usarlo como estado de las decisiones.

Documento para conducir la reunión con el cliente y **cerrar todas las decisiones abiertas** de una vez. Cada pregunta aparece **una sola vez**, indica qué bloquea y trae una propuesta del equipo para decidir rápido. Las propuestas **no son reglas**: solo pasan a serlo cuando el cliente responde (ver [PENDIENTES.md](PENDIENTES.md)).

Preparado el 2026-11-04 a partir de [PENDIENTES.md](PENDIENTES.md), [las resoluciones del 09 y 11 de octubre](RESOLUCIONES-2026-10-11.md), [el roadmap](../engineering/ROADMAP.md), [el análisis de fases](../engineering/F1-ANALISIS-FASES-2026-10-13.md) y la revisión del código.

## Cómo usarlo

- **Prioridad.** 🔴 bloquea construir una parte del sistema · 🟠 hay que definirlo antes de salir a producción · 🟢 puede esperar o tiene una propuesta razonable.
- **Respuesta.** Marcar una opción o escribir otra. Si el cliente no tiene preferencia, se anota «**usar propuesta**» y queda registrado.
- **Después de la reunión.** Las respuestas se copian a una nueva resolución (`RESOLUCIONES-AAAA-MM-DD.md`), se actualiza [PENDIENTES.md](PENDIENTES.md) y recién entonces se implementa.
- **Si surge algo nuevo en la reunión**, anotarlo en la sección 5 («Imprevistos») en lugar de decidirlo al vuelo.

### Orden sugerido de la reunión (≈ 3 horas)

| Tramo | Contenido                                                                                      | Tiempo |
| ----- | ---------------------------------------------------------------------------------------------- | ------ |
| 1     | Repaso de lo ya decidido (sección 1) y confirmación de que sigue vigente                       | 10 min |
| 2     | Todas las 🔴: bloques A, B, C, D, E, F, G, H, I (solo las marcadas 🔴)                         | 90 min |
| 3     | Las 🟠 por bloque                                                                              | 60 min |
| 4     | Las 🟢 que el cliente quiera cambiar; materiales a entregar (sección 3); fechas y responsables | 20 min |

---

## 1. Ya está decidido — no volver a preguntar

Si el cliente cambia de opinión sobre alguno, se trata como **cambio de requisito** (con su impacto), no como pregunta pendiente.

| ID   | Decisión vigente                                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | El responsable de inventario aprueba todos sus conteos y ajustes.                                                                                                                                                                                  |
| P-02 | El vendedor no ve los costos de compra.                                                                                                                                                                                                            |
| P-04 | Categorías de hasta dos niveles.                                                                                                                                                                                                                   |
| P-05 | SKU automático con correlativo único (hoy `SKU-000001`).                                                                                                                                                                                           |
| P-06 | Etiquetas propias en Code 128 con el SKU. _(Queda abierto: código del proveedor y QR → B5, B6.)_                                                                                                                                                   |
| P-07 | Costos adicionales prorrateados por valor de compra; costo de la pieza = último costo. Centavos por mayor resto. Con costos adicionales y valor de compra cero, no se confirma ([ADR-015](../decisions/ADR-015-reparto-centavos-y-valor-cero.md)). |
| P-08 | No se permite stock negativo.                                                                                                                                                                                                                      |
| P-09 | Todo se controla en piezas enteras.                                                                                                                                                                                                                |
| P-10 | Solo bolivianos (Bs).                                                                                                                                                                                                                              |
| P-11 | Numeración correlativa automática de ingresos y conteos.                                                                                                                                                                                           |
| P-12 | Tipo de documento de recepción en texto libre.                                                                                                                                                                                                     |
| P-13 | Los movimientos **no se bloquean** durante un conteo; se concilian al aprobarlo. _(Reemplaza la respuesta del 09/10 que decía bloquear. Queda abierto el alcance → E3.)_                                                                           |
| P-15 | El cliente crea los valores de atributos y asigna características a cada producto; solo existen las 12 definiciones del requerimiento.                                                                                                             |
| P-17 | Sin control de lotes ni números de serie.                                                                                                                                                                                                          |
| P-19 | Sesión fija de 3 horas, contraseña de mínimo 10 caracteres, sin 2FA.                                                                                                                                                                               |
| P-20 | Motivos de ajuste en texto libre.                                                                                                                                                                                                                  |
| P-21 | Un usuario puede tener varios roles.                                                                                                                                                                                                               |
| P-22 | No se puede desactivar un producto o variante con stock mayor que cero.                                                                                                                                                                            |
| P-23 | La auditoría y las sesiones vencidas se conservan indefinidamente.                                                                                                                                                                                 |
| P-24 | El encargado de inventario crea productos nuevos **activos** y recibe piezas no esperadas. _(Queda abierto: datos mínimos → C1.)_                                                                                                                  |
| P-27 | No se registra gramaje; se describe con variantes y características.                                                                                                                                                                               |
| P-03 | Precio base = (costo + transporte + embolsado + extras) × 2, editable, con cálculo propio por categoría. _(Quedan abiertos: redondeo y flujo → D1 a D4.)_                                                                                          |
| P-25 | Los cambios de precio requieren aprobación. _(Quedan abiertos: quién y cuándo → D4.)_                                                                                                                                                              |

**Fuera de alcance de la Fase 1** (reconfirmar solo en K3): punto de venta, facturación, Impuestos Nacionales, contabilidad, varias sucursales, app móvil, inteligencia artificial, compras automáticas e integraciones bancarias.

---

## 2. Mapa de pendientes y bloqueantes por área del proyecto

«Técnico» = trabajo nuestro que no depende del cliente. «Bloqueado por» = preguntas de este documento que lo destraban.

| Área                             | Estado hoy                                                                                | Pendiente técnico (sin cliente)                                                                                                                                                       | Bloqueado por |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Catálogo** (F1-03)             | Categorías, atributos, productos, variantes y SKU implementados; cierre en curso          | Integrar el trabajo en curso; gestión de valores de atributos; etiqueta Code 128; E2E del catálogo; validar P-22 (hoy no se encontró el bloqueo)                                      | B1–B11        |
| **Proveedores** (F1-01)          | Implementado; aceptación del cliente pendiente                                            | Demo guiada con el guion de aceptación                                                                                                                                                | C8, C9        |
| **Usuarios y accesos** (F1-02)   | Implementado; E2E final pendiente                                                         | Prueba final alta → login → cambio de contraseña; **no existe restablecer contraseña**; cambio obligatorio en el primer ingreso; limpieza de sesiones                                 | F1–F5         |
| **Ingresos de mercadería**       | Implementado y verificado; aceptación pendiente                                           | Pantalla de piezas nuevas (orden 3)                                                                                                                                                   | C1–C10        |
| **Precios**                      | No iniciado (el precio se edita a mano con permiso)                                       | Cálculo sugerido de solo lectura; historial de precios                                                                                                                                | D1–D9         |
| **Ajustes de inventario**        | No iniciado                                                                               | Flujo de ajuste con motivo y aprobación; `CHECK` de stock no negativo en la base; asignar permisos al responsable                                                                     | E1, E2        |
| **Conteo físico**                | No iniciado                                                                               | Instantánea, captura, revisión, conciliación y aprobación                                                                                                                             | E3–E6         |
| **Control y reportes**           | Alertas (sin stock, bajo mínimo), historial de movimientos y tablero de inicio listos     | **No existe pantalla de auditoría**; reportes y exportaciones                                                                                                                         | G1–G6         |
| **Seguridad**                    | Controles base listos; la revisión ofensiva y la auditoría estática **no se completaron** | Repetir ambas; mover la autorización antes de la validación en ~39 endpoints; rotación de `AUTH_SECRET`; alerta de logins fallidos; 4 avisos de `npm audit` en dependencias de Prisma | F2, F4        |
| **Rendimiento**                  | Sin mediciones                                                                            | Pruebas de carga con volumen realista; índices y consultas                                                                                                                            | A2            |
| **Infraestructura y despliegue** | Imagen Docker, CI y despliegue local listos                                               | Elegir y configurar hosting; copias externas; ensayo de restauración; monitoreo                                                                                                       | I1–I8         |
| **Calidad y entrega de código**  | Cuatro PR abiertos sin fusionar; trabajo de catálogo sin rama propia                      | Fusionar en orden; seis inconsistencias en la documentación                                                                                                                           | —             |
| **Datos iniciales**              | Sin plan de carga                                                                         | Importador (si se decide); etiquetado inicial                                                                                                                                         | H1–H6         |
| **Identidad y documentación**    | Paleta provisional; sin manual de usuario                                                 | Manual, acta de aceptación                                                                                                                                                            | J1–J3         |
| **Fase 2 (ventas)**              | Solo el menú «Próximamente»                                                               | —                                                                                                                                                                                     | K1, K3        |

---

## 3. Materiales que el cliente debe traer o enviar

Marcar al terminar la reunión quién lo entrega y cuándo.

| ☐   | Material                                                                                     | Para qué                         | Pregunta |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------- | -------- |
| ☐   | Lista de categorías y subcategorías                                                          | Cargar el catálogo               | B1       |
| ☐   | Valores de cada uno de los 12 atributos (materiales, tallas, piedras, colores, colecciones…) | Precargar las listas             | B2       |
| ☐   | Inventario actual (Excel, cuaderno u otro) con costos y precios si existen                   | Carga inicial                    | H1       |
| ☐   | Lista de proveedores con NIT y contacto                                                      | Cargar proveedores               | H4       |
| ☐   | Nombre, correo y rol de cada usuario                                                         | Crear las cuentas                | F1       |
| ☐   | Tabla de multiplicadores por categoría (si no es ×2 en todas)                                | Precio sugerido                  | D2       |
| ☐   | Logo en vectorial (SVG/PDF), colores y nombre comercial                                      | Identidad visual y etiquetas     | J1       |
| ☐   | Modelo de impresora de etiquetas y medida del rollo; modelo del lector de códigos            | Plantilla de etiqueta            | B7, A4   |
| ☐   | Ejemplo real de una factura o nota de remisión de un proveedor                               | Revisar el formulario de ingreso | C2, C8   |
| ☐   | Dominio (si existe) y datos del titular de las cuentas de hosting                            | Producción                       | I1, I2   |

---

## 4. Cuestionario

### A. Alcance y operación

**A1 🔴 ¿Qué necesitan funcionando primero para empezar a trabajar?**
Orden propuesto: catálogo + etiquetas → ingresos → ajustes → precios → conteo físico. _Bloquea:_ el orden de construcción y la fecha de arranque.
Respuesta: ☐ usar propuesta · ☐ otro orden: ______________________

**A2 🔴 ¿De qué tamaño es el negocio?** Cantidad aproximada de productos y de piezas en stock, ingresos por mes y personas que usarán el sistema a la vez. _Bloquea:_ dimensionar el hosting y las pruebas de rendimiento.
Respuesta: productos ____ · piezas ____ · ingresos/mes ____ · usuarios simultáneos ____

**A3 🔴 ¿Cuántos lugares físicos tienen stock?** (vitrina, depósito, taller, ferias, otra tienda). Hoy el sistema lleva **un solo stock por pieza**; saber en qué lugar está cada una exige cambiar el modelo de datos.
a) Un solo stock (propuesta) · b) Vitrina y depósito separados · c) Otros: ______________
_Bloquea:_ el modelo de datos y el alcance del conteo (E3).

**A4 🟠 ¿Desde qué equipos van a trabajar y cómo escanean?** PC, tablet, celular; lector USB/Bluetooth (funciona como teclado) o cámara del celular (no está construido).
Respuesta: ______________________

**A5 🟠 ¿Qué hacen si se cae el Internet?** El sistema funciona solo con conexión. Propuesta: anotar en papel y cargar después; modo sin conexión queda fuera de la Fase 1.
Respuesta: ☐ usar propuesta · ☐ necesitan trabajar sin conexión (se evalúa como proyecto aparte)

**A6 🟢 Formatos.** Bolivianos, fecha día/mes/año, coma decimal, hora de Bolivia (UTC−4), textos en español. ☐ Confirmado · ☐ Cambiar: ______

### B. Catálogo y códigos

**B1 🔴 Categorías.** Entregar la lista inicial (dos niveles). ¿Quién puede crear y cambiar categorías? Propuesta: administrador y responsable de inventario.
Respuesta: ☐ lista entregada · ☐ usar propuesta de permisos

**B2 🔴 Atributos y variantes.** Para cada atributo de los 12: valores, si **genera variantes** (cada combinación tiene su propio stock, p. ej. talla) o solo **describe** (p. ej. colección), y si es **obligatorio** en cada categoría. Criterio propuesto: _todo lo que se vende y se cuenta por separado es variante._

| Atributo | ¿Variante o descriptivo? | Obligatorio en (categorías) | Valores (o archivo adjunto) |
| -------- | ------------------------ | --------------------------- | --------------------------- |
|          |                          |                             |                             |

_Bloquea:_ la precarga de listas y las plantillas por categoría.

**B3 🟠 Piezas únicas y conjuntos.** ¿Hay piezas artesanales que existen una sola vez? ¿Venden conjuntos (collar + aretes) que descuenten varias piezas a la vez?
a) Todo se trata como pieza individual; la pieza única es una variante con 1 unidad (propuesta) · b) Los conjuntos son un producto compuesto (cambio de modelo; se evaluaría para la Fase 2).

**B4 🟢 Nombres.** ¿Usan «modelo/referencia» y descripción larga? ¿Hay una convención para nombrar productos (p. ej. «Tipo + Estilo + Piedra»)? ______

**B5 🔴 Códigos de barras y proveedor (cierra P-06).**

- ¿Se **conserva el código del proveedor** para buscar y escanear, además de la etiqueta propia?
- ¿Una pieza puede tener **más de un código** (el del proveedor y el nuestro)? Hoy es **uno por variante** y debe ser único.
- Si el proveedor ya trae etiqueta, ¿se pega la nuestra encima o se usa la del proveedor?

Propuesta: etiqueta propia siempre (Code 128 con el SKU) y el código del proveedor se guarda como dato de búsqueda por proveedor.
Respuesta: ☐ usar propuesta · ☐ otra: ______

**B6 🟠 QR (cierra P-06).** ¿Lo necesitan? ¿Para qué (ficha, vitrina, catálogo en línea) y qué debería abrir? Propuesta: fuera de la Fase 1 hasta que haya un uso concreto.
Respuesta: ☐ usar propuesta · ☐ lo necesitan para: ______

**B7 🔴 Etiquetas.** Impresora (marca y modelo; rollo térmico u hojas), tamaño de la etiqueta, contenido (código de barras + SKU, nombre, talla/material, precio, logo) y cuándo se imprime (al confirmar el ingreso, una por pieza, o bajo demanda).
Respuesta: impresora ______ · tamaño ______ · contenido ______ · cuándo ______
_Bloquea:_ el diseño de la plantilla de impresión.

**B8 🟠 Fotos y archivos (cierra P-14).** ¿Fotos de producto (cuántas, quién las toma)? ¿Escaneo de facturas y documentos de recepción? Hoy el sistema **no guarda archivos**; agregarlo implica almacenamiento en la nube con costo mensual.
a) No en la Fase 1 (propuesta) · b) Fotos de producto · c) Documentos de recepción · d) Ambos.

**B9 🟠 Quilataje y certificados (cierra lo que resta de P-27).** El quilataje se maneja como parte del material (p. ej. «Oro 18K»). ¿Se registra un número o foto de **certificado** por pieza?
a) No (propuesta) · b) Número de certificado como característica · c) Archivo (depende de B8).

**B10 🔴 Stock mínimo.** ¿Se define por variante, por categoría o con un valor general? ¿Valor inicial al crear? ¿«Bajo mínimo» es **menor o igual** al mínimo (como está hoy) o solo menor? ¿Quién lo ajusta?
Propuesta: por variante, valor inicial 0 (sin alerta) hasta que lo defina el responsable; alerta cuando la cantidad es **menor o igual** al mínimo.
Respuesta: ☐ usar propuesta · ☐ otra: ______

**B11 🟠 Retirar piezas.** Con P-22 no se puede desactivar con stock. ¿Cómo retiran una pieza que ya no se vende pero aún tienen unidades?
a) Dar de baja las unidades con un ajuste y luego desactivar (propuesta) · b) Estado «Descontinuado»: no se repone pero conserva el stock · c) Otro: ______
Además, ¿se pueden **borrar** fichas creadas por error que no tienen movimientos? ☐ Sí, solo el administrador (propuesta) · ☐ No, solo desactivar.

### C. Proveedores e ingresos de mercadería

**C1 🔴 Piezas nuevas durante un ingreso (cierra P-24).** Para poder confirmar un ingreso con una pieza nueva, ¿qué datos mínimos se exigen?
a) Categoría, nombre, costo y cantidad; lo demás se completa después (propuesta) · b) Además los atributos obligatorios de su categoría · c) La ficha completa.
Si es a): ¿se marca la ficha como **incompleta** con una lista de pendientes para completar? ¿Quién las completa y en qué plazo? ¿Su **precio de venta** queda en 0 y sin poder venderse hasta que se apruebe (D4)? ¿Se elimina entonces el estado «Borrador» de producto?
Respuesta: ______________________

**C2 🔴 Diferencias de recepción.** Si llega más o menos de lo que dice el documento: ¿se exige escribir el motivo? ¿Se lleva un registro de reclamos al proveedor? ¿Se bloquea la confirmación sin motivo?
Propuesta: motivo obligatorio cuando hay diferencia; sin módulo de reclamos en la Fase 1.
Respuesta: ☐ usar propuesta · ☐ otra: ______

**C3 🟠 Quién confirma un ingreso.** Hoy quien lo crea puede confirmarlo. ¿Quieren que **otra persona** lo confirme, o basta con que quede registrado quién lo hizo?
a) Basta el registro (propuesta) · b) Debe confirmar otra persona.

**C4 🟠 Corregir un ingreso ya confirmado.** Hoy solo se corrige con un ajuste. ¿Necesitan «anular ingreso» (revierte el stock con movimientos compensatorios, mientras las piezas sigan en stock)?
a) Solo ajustes (propuesta) · b) Anulación con autorización del administrador.

**C5 🟠 Entregas parciales.** Un mismo documento del proveedor que llega en varias entregas: ¿un ingreso por entrega o un ingreso que se va completando? Propuesta: un ingreso por entrega, con el mismo número de documento.

**C6 🟠 Fecha del ingreso.** ¿Registran ingresos con fecha pasada (cargas atrasadas)? ¿Hasta cuántos días? Propuesta: la fecha de recepción se puede editar hasta 30 días atrás; el movimiento siempre queda con la fecha real del registro.

**C7 🔴 Costos adicionales y moneda.** Hoy hay tres conceptos: transporte, embolsado y valores extras. ¿Hay otros (aduana, aranceles, seguro, comisión)? ¿Compran en dólares u otra moneda? Con P-10 todo es en Bs: el costo se ingresa **ya convertido**, sin guardar tipo de cambio.
Respuesta: otros conceptos ______ · ☐ todo en Bs (propuesta) · ☐ necesitan guardar moneda y tipo de cambio (reabre P-10)

**C8 🟠 Proveedores.** Datos obligatorios: ¿NIT, contacto, teléfono, dirección? ¿Plazo o condiciones de pago? (Cuentas por pagar y pagos son contabilidad, fuera de alcance.) ¿Cada producto tiene un proveedor habitual?
Respuesta: obligatorios ______ · condiciones de pago: ☐ sí ☐ no

**C9 🟠 Devoluciones a proveedor y consignación.** ¿Devuelven mercadería al proveedor? ¿Reciben piezas en **consignación** (no son propias hasta venderse)? Si es así hay que crear un tipo de movimiento y tratar su costo distinto.
a) Ninguna de las dos (propuesta) · b) Devoluciones · c) Consignación · d) Ambas.

**C10 🟢 Historial de costos.** Hoy se guarda el último costo y cada cambio queda en la auditoría. ¿Quieren ver la evolución del costo de una pieza y compararlo entre proveedores? Propuesta: sí, como consulta, sin pantalla propia en la Fase 1.

### D. Costos y precios

**D1 🔴 Redondeo del precio sugerido (cierra P-03).** Opciones: a) sin redondeo · b) al boliviano entero hacia arriba · c) a múltiplos de Bs 0,50 · d) a «precio psicológico» (terminado en 9) · e) distinto por categoría.
Respuesta: ______

**D2 🔴 Multiplicador por categoría.** Hoy ×2 para todo. Completar solo las que sean distintas:

| Categoría | Multiplicador | Redondeo (si es distinto) |
| --------- | ------------- | ------------------------- |
|           |               |                           |

**D3 🔴 ¿Cuándo se calcula el precio?** Cuando un nuevo ingreso cambia el último costo:
a) Solo se **muestra la sugerencia** y alguien decide cambiarla (propuesta) · b) Se genera automáticamente una **solicitud de cambio** para aprobar · c) Nada automático.
Además: si el costo **baja**, ¿se sugiere bajar el precio o solo se avisa?
Respuesta: ______

**D4 🔴 Aprobación de cambios de precio (cierra P-25).**

- ¿Quién puede **solicitar** un cambio? ¿Quién **aprueba**? ¿Puede el responsable de inventario aprobar los suyos (como en P-01)?
- ¿Rige **de inmediato** al aprobar o en una fecha programada?
- ¿Los cambios masivos (todo un ingreso o una categoría) se aprueban en bloque?
- ¿Algún cambio menor (por ejemplo, ±5 %) no necesita aprobación?

Propuesta: solicita inventario, aprueba el administrador, vigencia inmediata, aprobación en bloque permitida, sin excepciones por monto.
Respuesta: ☐ usar propuesta · ☐ otra: ______
_Nota:_ hoy el precio se cambia directo con el permiso `prices:manage`; hasta cerrar esto no se ampliará.

**D5 🟠 Historial de precios.** ¿Necesitan consultar qué precio tenía una pieza en una fecha? Será indispensable para ventas. Propuesta: tabla de historial propia (no solo auditoría).

**D6 🟠 Varios precios.** ¿Un solo precio por pieza o varias listas (minorista, mayorista, ferias, ofertas)? ¿Descuentos y promociones? Propuesta: un precio en la Fase 1; el resto con ventas.

**D7 🟠 Impuestos.** El precio de venta guardado, ¿incluye impuestos? Aunque la facturación está fuera de alcance, esto define qué significa el número guardado. a) Precio final al público, impuestos incluidos (propuesta) · b) Precio sin impuestos.

**D8 🟠 Quién ve qué.** Costo, margen y precio. Propuesta: el vendedor ve precios y no costos (P-02); el responsable y el administrador ven costos y margen. ¿Algún otro ajuste?

**D9 🟢 Precio cero.** ¿Puede existir una pieza en stock sin precio? Propuesta: sí, pero no podrá venderse en la Fase 2 hasta tener precio.

### E. Ajustes de inventario y conteo físico

**E1 🔴 Ajustes manuales.** Situaciones que los generan: pérdida, robo, daño, error de registro, obsequio o muestra, uso interno, reparación. Con P-20 el motivo es libre.

- ¿Quieren una **lista de motivos sugeridos** (más fácil de reportar) con la opción de escribir otro?
- ¿Un ajuste grande debe **avisar** al dueño (aviso, no aprobación)? ¿Desde cuántas piezas o desde qué valor?

Propuesta: lista sugerida + texto libre; aviso al administrador desde Bs ______ o ______ piezas.
Respuesta: ______

**E2 🟠 Piezas fuera del stock «disponible».** ¿Hay piezas en taller o reparación, exhibidas en ferias o prestadas? ¿Deben contarse como stock disponible o aparte?
a) No existen o se tratan con ajuste (propuesta) · b) Necesitan un estado «fuera de tienda».

**E3 🔴 Alcance del conteo (cierra P-13).** a) Toda la tienda a la vez · b) Por categoría (propuesta) · c) Por lugar (depende de A3) · d) Muestra aleatoria. ¿Con qué frecuencia? ¿Puede haber **varios conteos abiertos a la vez** (cada uno de una categoría distinta)?
Respuesta: ______

**E4 🔴 Método de conteo.** ¿La persona **ve la cantidad del sistema** mientras cuenta o cuenta «a ciegas»? ¿Cuenta una persona o dos (doble conteo)? ¿Con lector de códigos o con lista? ¿Qué se hace con una pieza encontrada **sin ficha** en el sistema?
Propuesta: a ciegas, una persona, con lector; pieza sin ficha → se registra como hallazgo y se resuelve con un ingreso.
Respuesta: ☐ usar propuesta · ☐ otra: ______

**E5 🔴 Conteos largos y sesión de 3 horas.** Un conteo puede durar más de 3 horas y P-19 cierra la sesión a las 3 horas exactas aunque se esté trabajando.
a) El avance se guarda pieza por pieza y, al volver a entrar, continúa donde quedó (propuesta; sin cambiar P-19) · b) Excepción de sesión más larga solo durante un conteo (reabre P-19).

**E6 🟠 Recuento de diferencias.** ¿Se exige volver a contar las piezas con diferencia antes de aprobar? Propuesta: sí, una vez; la aprobación sigue siendo del responsable (P-01).

### F. Usuarios, roles y seguridad

**F1 🔴 Usuarios iniciales.** Nombre, correo propio y rol de cada persona. Reglas propuestas: **una cuenta por persona** (nada de usuarios compartidos, por la trazabilidad); **al menos dos administradores** para no perder el acceso; al irse una persona, se desactiva su cuenta el mismo día (no se borra: conserva su historial).

| Nombre | Correo | Rol(es) |
| ------ | ------ | ------- |
|        |        |         |

**F2 🔴 Contraseña olvidada.** Hoy una persona puede **cambiar** su contraseña estando dentro, pero **no existe «olvidé mi contraseña»** ni que el administrador la restablezca: quien la olvide queda sin acceso.
a) El administrador asigna una contraseña temporal y la persona debe cambiarla al entrar (propuesta: simple, sin correo) · b) Recuperación automática por correo (requiere servicio de correo y costo mensual).
Respuesta: ______

**F3 🔴 Roles y permisos.** Confirmar o corregir esta matriz. ✔ = permitido hoy o propuesto · ❓ = hay que decidir.

| Acción                       | Administrador | Responsable de inventario | Vendedor  |
| ---------------------------- | :-----------: | :-----------------------: | :-------: |
| Ver catálogo y stock         |       ✔       |             ✔             |     ✔     |
| Crear y editar catálogo      |       ✔       |             ✔             |     —     |
| Ver costos y márgenes        |       ✔       |             ✔             |     —     |
| Solicitar cambio de precio   |       ✔       |            ❓             |     —     |
| Aprobar cambio de precio     |       ✔       |          ❓ (D4)          |     —     |
| Proveedores                  |       ✔       |             ✔             |     —     |
| Crear y confirmar ingresos   |       ✔       |             ✔             |     —     |
| Registrar y aprobar ajustes  |       ✔       |         ✔ (P-01)          |     —     |
| Contar y aprobar conteos     |       ✔       |         ✔ (P-01)          | ❓ contar |
| Ver reportes y tablero       |       ✔       |             ✔             |    ❓     |
| Ver auditoría                |       ✔       |            ❓             |     —     |
| Administrar usuarios y roles |       ✔       |             —             |     —     |

¿Se necesitan roles adicionales (auditor de solo lectura, auxiliar que cuenta pero no aprueba, cajero para la Fase 2)?
Respuesta: ______

**F4 🟠 Acceso desde Internet.** El sistema es accesible desde cualquier lugar. ¿El dueño o los empleados entrarán desde fuera del local? Se mantiene P-19 (sin 2FA) salvo que el cliente pida lo contrario para el administrador; se le informa que la contraseña es la única barrera.
Respuesta: ☐ mantener P-19 · ☐ pedir segundo factor para administradores (reabre P-19)

**F5 🟢 Primer ingreso.** La contraseña inicial debe cambiarse obligatoriamente al entrar por primera vez. ☐ Confirmado.

### G. Reportes, alertas y control

**G1 🔴 Reportes.** Marcar los que necesitan y el formato (pantalla, Excel/CSV, PDF, impresión):

| ☐   | Reporte                                                     | Formato |
| --- | ----------------------------------------------------------- | ------- |
| ☐   | Stock actual por categoría y variante                       |         |
| ☐   | Sin stock y bajo mínimo (a reponer)                         |         |
| ☐   | Movimientos por fecha, usuario o tipo                       |         |
| ☐   | Historial completo de una pieza (kardex)                    |         |
| ☐   | Ingresos por proveedor y período                            |         |
| ☐   | Diferencias de conteos y ajustes por motivo                 |         |
| ☐   | Valor del inventario (a costo y a precio)                   |         |
| ☐   | Historial de precios y costos                               |         |
| ☐   | Otros: ____________________________________________________ |         |

**G2 🟠 Valor del inventario.** ¿Cuánto vale lo que tienen? Propuesta: cantidad × último costo, y también a precio de venta; con corte a una fecha.

**G3 🟠 Alertas.** ¿Solo en pantalla o también por correo o WhatsApp? ¿A quién, y con qué frecuencia? Propuesta: solo en pantalla en la Fase 1 (los avisos externos requieren un servicio de mensajería).

**G4 🟠 Pantalla de inicio.** ¿Qué quiere ver el dueño al entrar? Hoy: totales de piezas, sin stock, bajo mínimo y una tabla de piezas en alerta. ______

**G5 🟠 Auditoría.** Hoy todo se guarda pero **no hay pantalla** para consultarlo. ¿Quién la consulta (propuesta: solo el administrador), con qué filtros (usuario, fecha, acción, pieza) y para qué?

**G6 🟢 Exportaciones.** ¿Quieren descargar el catálogo y el inventario en Excel/CSV para copias propias? Propuesta: sí.

### H. Datos iniciales y puesta en marcha

**H1 🔴 Inventario actual.** ¿En qué está hoy (Excel, cuaderno, otro programa)? ¿Cuántas filas? ¿Trae códigos, costos y precios confiables? ¿Quién lo prepara?
a) Carga manual desde pantalla · b) Importación masiva desde Excel (hay que construirla; recomendable sobre ~200 piezas) · c) Lo carga el equipo técnico con los datos entregados.
Respuesta: ______

**H2 🔴 Arranque.** ¿Fecha prevista? ¿Hacen un **conteo físico completo** antes de cargar el stock inicial? Para piezas sin costo histórico, ¿qué costo se asigna (el de reposición, uno estimado, cero)? ¿Se cargan los precios actuales?
Respuesta: ______

**H3 🔴 Etiquetado inicial.** ¿Cuántas piezas hay que etiquetar? ¿Quién lo hace y cuándo? (Conviene que el etiquetado ocurra antes de la fecha de arranque.)
Respuesta: piezas ____ · responsable ______ · fecha ______

**H4 🟠 Proveedores actuales.** Entregar la lista (sección 3).

**H5 🟠 Periodo en paralelo.** ¿Trabajan con el sistema y con el método actual durante unas semanas? ¿Con qué criterio dejan el anterior? Propuesta: 2 semanas en paralelo y un conteo de verificación.

**H6 🟠 Capacitación.** ¿Quiénes se capacitan, cuántas sesiones, presencial o remota? ¿Necesitan manual impreso o videos cortos? ______

### I. Infraestructura, copias de seguridad y soporte

**I1 🔴 Hosting (cierra P-18).** Propuesta: servicio administrado (Render) con base de datos administrada y copia externa (Cloudflare R2). Costo orientativo ~US$ 27/mes, a verificar al contratar. ¿Se aprueba? ¿Presupuesto mensual máximo? **Las cuentas (hosting, dominio, repositorio, almacenamiento de copias) deben quedar a nombre del cliente:** ¿quién es el titular y quién paga?
Respuesta: ☐ aprobar propuesta · ☐ otra: ______ · presupuesto ______ · titular ______

**I2 🔴 Dominio.** ¿Tienen uno? Propuesta de dirección: `inventario.<su dominio>`. ¿Quién administra el DNS?
Respuesta: ______

**I3 🔴 Tolerancia a fallas (cierra P-26).**

- **Pérdida máxima de datos aceptable:** a) minutos (más costo) · b) hasta 24 horas (propuesta mínima).
- **Tiempo máximo caído:** a) 4 horas (propuesta) · b) 1 día laboral · c) otro.
- **Horario crítico** (cuándo no puede fallar): ______
  Respuesta: ______

**I4 🟠 Copias de seguridad.** Propuesta: copia diaria cifrada fuera del proveedor, 30 diarias + 12 mensuales, y una prueba de restauración cada trimestre. ¿Quién recibe el aviso si una copia falla y quién puede restaurar? ______

**I5 🟠 Ambiente de pruebas.** ¿Quieren un entorno separado para probar cambios antes de producción? Tiene costo extra mensual. a) No: se prueba en local y con demos (propuesta) · b) Sí.

**I6 🟠 Soporte después de la entrega.** ¿Quién atiende incidentes, en qué horario, con qué canal (WhatsApp, correo) y en cuánto tiempo? ¿Hay contrato de mantenimiento y garantía de correcciones? ¿Quién decide y cobra las mejoras nuevas? ______

**I7 🟠 Ventana de mantenimiento.** Horario sin uso para publicar actualizaciones (propuesta: domingo por la noche o madrugada).

**I8 🟠 Aviso de caídas.** ¿A quién se avisa si el sistema deja de responder y por qué medio? ______

### J. Identidad y entregables

**J1 🟠 Identidad visual (cierra P-16).** Nombre comercial en pantalla, logo (vectorial), colores y tipografía. ¿El logo va en las etiquetas? Si no hay definición, se mantiene la paleta dorada provisional.
Respuesta: ______

**J2 🟠 Entregables.** Marcar: ☐ manual de usuario · ☐ acta de aceptación por módulo · ☐ acceso al repositorio y a las cuentas · ☐ documentación técnica · ☐ propiedad del código y licencia (definir por escrito) · ☐ otro: ______

**J3 🟢 Datos personales.** En la Fase 1 solo se guardan datos de empleados (nombre y correo) y de proveedores. No hay datos de clientes finales. ☐ Confirmado.

### K. Fase 2 y cierre

**K1 🟠 Menú «Ventas».** El menú muestra «Próximamente» (sin funcionamiento). ¿Se mantiene o se oculta para no generar expectativas? ¿Cuándo esperan la Fase 2 y qué incluye (caja, clientes, facturación electrónica, devoluciones y cambios)? Esto se cotiza aparte; aquí solo se anota para dejar el diseño preparado.
Respuesta: ☐ mantener · ☐ ocultar · expectativa de fecha ______

**K2 🟠 Aceptación.** ¿Quién firma por el cliente? ¿Con qué guion y en qué entorno se hace la demostración de cada módulo? ¿Fecha? Hay cuatro módulos por aceptar: proveedores, usuarios, catálogo e ingresos. ______

**K3 🟢 Fuera de alcance.** Reconfirmar que la Fase 1 no incluye punto de venta, facturación, contabilidad, varias sucursales, app móvil, IA, compras automáticas ni integraciones bancarias. ☐ Confirmado · ☐ Urgente adelantar: ______

**K4 🟠 Plazos y costos de la Fase 1.** Con las respuestas de este cuestionario se estima el cronograma por hito. ¿Hay fechas límite del negocio (temporada, apertura) que condicionen el orden? ______

---

## 5. Imprevistos surgidos en la reunión

Todo lo nuevo se anota aquí y se evalúa después; no se decide al vuelo.

| #   | Tema | Quién lo pidió | Prioridad | Se resuelve en |
| --- | ---- | -------------- | --------- | -------------- |
|     |      |                |           |                |

## 6. Cierre — acta de decisiones

| Pregunta | Decisión | Responsable (cliente) | Fecha límite |
| -------- | -------- | --------------------- | ------------ |
|          |          |                       |              |

Con esta tabla se arma `RESOLUCIONES-AAAA-MM-DD.md`, se actualiza [PENDIENTES.md](PENDIENTES.md) y se ajusta el [roadmap](../engineering/ROADMAP.md): cada pregunta cerrada destraba la porción que figura en la sección 2.

# Sesión de revisión: decisiones aplicadas por defecto

Material para la sesión de revisión acordada por el responsable el 2026-11-09
([RESOLUCIONES-2026-11-09](RESOLUCIONES-2026-11-09.md), D4; decisión P-47 de
[PENDIENTES.md](PENDIENTES.md)). Reúne **todas** las decisiones marcadas 🟠 (aplicadas por defecto del
modo más conservador, no confirmadas) y las 🟡 (pendientes o parciales con algo preparado hoy).

## Cómo usar este documento

- Cada decisión tiene el mismo formato: enunciado, **valor aplicado hoy** (verificado en el código o
  en el ADR citado), por qué se aplicó, riesgo si es incorrecto y una **pregunta cerrada**.
- La respuesta es **aceptar** el valor actual o **corregirlo** (indicando el valor correcto). Aceptar no
  cambia el sistema; corregir abre una tarea que se planifica aparte.
- Un valor aceptado se pasa en PENDIENTES.md de 🟠 a 🟢 y se registra en una resolución fechada. Nada de
  esto se convierte en regla hasta que el responsable responda.
- Las decisiones 🟢 (por ejemplo P-33 y P-40) ya están resueltas y no se revisan aquí.
- Cifras de este documento: **15 decisiones 🟠** y **9 decisiones 🟡**.

Orden sugerido para la sesión: primero lo que afecta al dinero y al control (P-43, P-42, P-34, P-35),
luego lo que afecta a la operación diaria (P-28, P-29, P-31, P-32, P-36, P-37, P-38, P-39, P-41), después
el conteo físico (P-C1 a P-C3), la auditoría (P-AUD-1, P-AUD-2) y por último lo pendiente de
infraestructura e identidad (P-10, P-14, P-16, P-18, P-26, P-30).

## Parte 1. Decisiones 🟠 (aplicadas por defecto)

### P-28 · ¿«Obligatorio» por categoría bloquea el guardado de la ficha?

- **Valor aplicado hoy:** solo la pantalla de producto pide los atributos obligatorios de la categoría
  (`apps/web/src/features/catalog/product-form.tsx`); la API acepta la ficha sin ellos
  (`products.service.ts` no valida `isRequired`).
- **Por qué se aplicó:** el cliente (C1) permite fichas incompletas, y el alta rápida desde un ingreso
  crea fichas sin esos datos.
- **Riesgo si es incorrecto:** fichas guardadas sin datos que la categoría marcó como obligatorios, sin
  que nada lo impida fuera de la pantalla.
- **Pregunta:** ¿la API debe rechazar el guardado de una ficha que no tenga los atributos obligatorios
  de su categoría? Aceptar (solo la pantalla los pide) o corregir (la API los exige).
- **Respuesta del responsable:** _se completa en la sesión._

### P-29 · ¿«Sin precio» e «incompleta» cuentan piezas inactivas?

- **Valor aplicado hoy:** no. Los filtros y los contadores del Inicio ignoran los productos inactivos, y
  «Sin precio» mira solo variantes **activas** con precio de venta 0 (`products.service.ts`:
  `withoutPriceWhere`, `hasMissingPrice`, `health()`).
- **Por qué se aplicó:** una pieza inactiva no se vende ni se repone; contarla ensuciaría el aviso.
- **Riesgo si es incorrecto:** una pieza inactiva sin precio o incompleta pasa inadvertida y, al
  reactivarla, sale a la venta sin precio.
- **Pregunta:** ¿las piezas inactivas deben contarse como «sin precio» o «incompleta»? Aceptar (no se
  cuentan) o corregir (sí se cuentan).
- **Respuesta del responsable:** _se completa en la sesión._

### P-31 · Código de proveedor que corresponde a varias piezas

- **Valor aplicado hoy:** la búsqueda responde 409 con el mensaje «Ese código de proveedor corresponde
  a varias piezas. Búsquela por su SKU.» (`products.service.ts`, `lookupVariant`).
- **Por qué se aplicó:** elegir una al azar sería peor que pedir un dato inequívoco.
- **Riesgo si es incorrecto:** con un lector de códigos, una lectura ambigua se detiene y obliga a
  escribir el SKU; será más molesto cuando exista el mostrador de ventas.
- **Pregunta:** ¿se mantiene pedir el SKU o se prefiere mostrar una lista de piezas para elegir? Aceptar
  (pedir el SKU) o corregir (lista para elegir).
- **Respuesta del responsable:** _se completa en la sesión._

### P-32 · ¿Hace falta el código propio `SOLE-…` si la etiqueta imprime el SKU?

- **Valor aplicado hoy:** se conserva el botón «Generar código propio» (`variant-row.tsx`), que guarda
  `SOLE-` más el identificador de la variante como código de barras (`products.service.ts`); la
  etiqueta imprime siempre el SKU en Code 128 (Q-10 A, P-06).
- **Por qué se aplicó:** quitarlo es irreversible para quien ya lo use; mantenerlo no estorba.
- **Riesgo si es incorrecto:** dos códigos para la misma pieza (SKU y `SOLE-…`) que confunden al
  personal; o, si se retira, se pierde la opción para piezas sin código de proveedor.
- **Pregunta:** ¿se conserva el botón «Generar código propio»? Aceptar (se conserva) o corregir
  (se retira).
- **Respuesta del responsable:** _se completa en la sesión._

### P-34 · Quién ve ingresos sin ver costos

- **Valor aplicado hoy:** un rol con `stock-entries:read` pero sin `costs:read` ve el ingreso con todos
  los campos de costo en `null`; para cargar precios, costos o piezas nuevas, o para confirmar, se exige
  además `costs:read` (`stock-entries.service.ts`, `hasCostAccess`). El Vendedor no tiene acceso a
  ingresos (`DEFAULT_ROLE_PERMISSIONS`).
- **Por qué se aplicó:** los costos son información reservada (P-02) y no se quería ocultar el ingreso
  completo.
- **Riesgo si es incorrecto:** alguien ve que hubo un ingreso (proveedor, piezas, cantidades) sin los
  costos, o no puede trabajar un ingreso por no tener `costs:read`.
- **Pregunta:** ¿está bien que un rol vea los ingresos sin los costos? Aceptar o corregir (exigir
  `costs:read` para ver cualquier ingreso).
- **Respuesta del responsable:** _se completa en la sesión._

### P-35 · Redondeo al mostrar totales del ingreso

- **Valor aplicado hoy:** los cálculos son exactos (4 decimales por unidad, centavos por parte) y los
  totales mostrados se redondean a centavos con la mitad hacia arriba
  ([ADR-016](../decisions/ADR-016-compras-en-dolares-y-costos-de-importacion.md);
  `stock-entries.service.ts` muestra los importes con `toFixed(2)`).
- **Por qué se aplicó:** es el redondeo comercial habitual.
- **Riesgo si es incorrecto:** diferencias de centavos entre el total del sistema y el de la factura del
  proveedor.
- **Pregunta:** ¿el redondeo de la mitad hacia arriba a centavos es el que usa el negocio? Aceptar o
  corregir (indicar la regla).
- **Respuesta del responsable:** _se completa en la sesión._

### P-36 · Cómo se limpia la marca «ficha incompleta» y quién completa la ficha

- **Valor aplicado hoy:** la marca manual `profileIncomplete` queda hasta que alguien con
  `catalog:manage` la desmarca en la ficha (`PATCH /products/:id` con `profileIncomplete: false`). El
  Inicio muestra el contador de fichas incompletas.
- **Por qué se aplicó:** el cliente no dijo quién ni cuándo; solo quien administra el catálogo puede
  cambiarla.
- **Riesgo si es incorrecto:** la marca queda para siempre si nadie la limpia, o se limpia sin que la
  ficha esté realmente completa.
- **Pregunta:** ¿quien tiene permiso de administrar el catálogo (Administrador y Responsable) debe poder
  limpiar la marca a mano? Aceptar o corregir (indicar quién, o que se limpie sola al completar datos).
- **Respuesta del responsable:** _se completa en la sesión._

### P-37 · Código del proveedor repetido dentro del mismo proveedor

- **Valor aplicado hoy:** no se guarda como código de barras ni en la relación proveedor-pieza; se avisa
  y la pieza se identifica por su SKU (`stock-entries.service.ts`, alta rápida).
- **Por qué se aplicó:** un código debe identificar una sola pieza (regla 2 de `CLAUDE.md`).
- **Riesgo si es incorrecto:** una pieza nueva queda sin su código de proveedor y hay que buscarla por
  SKU.
- **Pregunta:** ¿se acepta que, si el código del proveedor ya lo usa otra pieza, la nueva se identifique
  solo por su SKU? Aceptar o corregir (indicar qué hacer).
- **Respuesta del responsable:** _se completa en la sesión._

### P-38 · Fecha del documento de un borrador que supera los 30 días

- **Valor aplicado hoy:** la fecha del documento no puede ser futura ni anterior a 30 días; se valida al
  crear y, en un borrador ya guardado, **solo si se cambia la fecha**. Un borrador antiguo se puede
  seguir editando (`stock-entries.service.ts`, `assertDocumentDate`).
- **Por qué se aplicó:** no bloquear trabajo ya iniciado.
- **Riesgo si es incorrecto:** se confirma un ingreso con una fecha de documento de hace meses sin
  advertencia.
- **Pregunta:** ¿un borrador cuya fecha ya superó los 30 días debe seguir siendo editable y confirmable?
  Aceptar o corregir (obligar a actualizar la fecha).
- **Respuesta del responsable:** _se completa en la sesión._

### P-39 · Ingresos antiguos confirmados

- **Valor aplicado hoy:** en los ingresos confirmados antes de ingresos v2, el costo adicional asignado
  y el costo total por ítem se reconstruyeron desde el costo adicional unitario, porque el reparto
  exacto no se guardaba. Migración `20261106020100_stock_entry_import_costs`; el costo unitario vigente
  no cambia.
- **Por qué se aplicó:** no había otra fuente; evita perder el desglose.
- **Riesgo si es incorrecto:** diferencias de centavos en el desglose histórico de ingresos antiguos.
- **Pregunta:** ¿se acepta esa reconstrucción aproximada del desglose de los ingresos antiguos? Aceptar
  o corregir (indicar cuáles revisar). Nota: si aún no hay ingresos reales, esta decisión no tiene
  efecto práctico.
- **Respuesta del responsable:** _se completa en la sesión._

### P-41 · Cuándo se considera incompleta una ficha

- **Valor aplicado hoy:** incompleta si **cualquiera** de dos señales es verdadera: la marca manual
  `profileIncomplete` (P-36) o la calculada (sin descripción **y** sin características descriptivas)
  (`products.service.ts`: `incompleteWhere`, `isIncomplete`). Filtros, insignias y contador del Inicio
  usan la combinación.
- **Por qué se aplicó:** la marca manual sola no debía perderse aunque la ficha tenga descripción.
- **Riesgo si es incorrecto:** fichas que se muestran como incompletas aunque el personal las considere
  terminadas, o al revés.
- **Pregunta:** ¿una ficha sin descripción y sin características descriptivas debe contarse como
  incompleta, además de las marcadas a mano? Aceptar o corregir.
- **Respuesta del responsable:** _se completa en la sesión._

### P-42 · Cómo se avisa al Administrador de lo que espera su aprobación

- **Valor aplicado hoy:** bandeja «Pendientes de aprobación» en el Inicio (`GET /approvals/pending`):
  cuenta ajustes pendientes, cambios de precio pendientes y conteos en revisión. Cada total se calcula
  solo si la persona tiene el permiso para resolver ese tipo. Sin correo y sin umbrales por monto
  (`approvals.service.ts`).
- **Por qué se aplicó:** el cliente (Q-14 A) pidió que no hubiera correo.
- **Riesgo si es incorrecto:** una aprobación puede quedar esperando días si nadie abre el Inicio.
- **Pregunta:** ¿basta con la bandeja en el Inicio, sin correo ni umbrales? Aceptar o corregir (indicar
  aviso adicional).
- **Respuesta del responsable:** _se completa en la sesión._

### P-43 · Riesgo aceptado: una persona solicita y aprueba

- **Valor aplicado hoy:** el Responsable de inventario tiene `inventory:adjust`,
  `inventory:adjust-approve`, `prices:approve`, `inventory-counts:approve` e `inventory:exchange`
  (`packages/shared/src/permissions.ts`): puede aprobar sus propias solicitudes y registrar cambios de
  pieza sin segundo aprobador. Queda trazado en la auditoría (quién pidió y quién aprobó).
- **Por qué se aplicó:** regla compartida del 2026-11-05 para que ningún trámite quede esperando solo al
  Administrador.
- **Riesgo si es incorrecto:** sin segregación de funciones, un error o fraude de una sola persona sobre
  stock o precios no tiene segundo control. Cobra más importancia al manejar dinero (Ventas) y porque en
  Ventas el Responsable también abriría y cerraría caja (B3).
- **Pregunta:** ¿se acepta por escrito que el Responsable pueda solicitar y aprobar él mismo ajustes,
  precios y conteos? Aceptar o corregir (exigir un segundo aprobador, p. ej. sobre un monto).
- **Respuesta del responsable:** _se completa en la sesión._

### P-AUD-1 · ¿La auditoría se puede exportar?

- **Valor aplicado hoy:** no hay exportación. La pantalla de Auditoría solo consulta (`audit.routes.ts`
  solo tiene rutas de lectura); solo la ve el Administrador.
- **Por qué se aplicó:** no se pidió; los reportes y exportaciones (G) estaban sin respuesta. D1 aprobó
  solo el CSV de inventario y movimientos.
- **Riesgo si es incorrecto:** una revisión externa o del contador exige copiar datos a mano.
- **Pregunta:** ¿hace falta exportar la auditoría (CSV o PDF)? Aceptar (no) o corregir (sí, en qué
  formato).
- **Respuesta del responsable:** _se completa en la sesión._

### P-AUD-2 · Qué debe poder buscarse en la auditoría

- **Valor aplicado hoy:** se busca por texto en acción, tipo, ID de entidad y nombre o correo del
  usuario. **No** por nombre o SKU de la pieza afectada (el registro guarda el ID). Los campos sin
  etiqueta del antes y después se muestran con su nombre técnico.
- **Por qué se aplicó:** es lo que el registro guarda sin consultas adicionales.
- **Riesgo si es incorrecto:** encontrar «qué pasó con esta pieza» exige conocer su ID.
- **Pregunta:** ¿se necesita buscar la auditoría por nombre o SKU de la pieza? Aceptar (no) o corregir
  (sí).
- **Respuesta del responsable:** _se completa en la sesión._

## Parte 2. Decisiones 🟡 (pendientes o parciales con algo preparado)

### P-10 · Moneda

- **Valor aplicado hoy:** el sistema trabaja en bolivianos; cada ingreso puede registrarse en Bs o en
  dólares con tipo de cambio manual, fijo al confirmar. Solo dólares
  ([ADR-016](../decisions/ADR-016-compras-en-dolares-y-costos-de-importacion.md)).
- **Por qué se aplicó:** Q-07 A del 2026-11-05.
- **Riesgo si es incorrecto:** compras en otra moneda (por ejemplo yuanes) no se pueden registrar.
- **Pregunta:** ¿alcanza con bolivianos y dólares? Aceptar o corregir (otras monedas o una cotización de
  referencia).
- **Respuesta del responsable:** _se completa en la sesión._

### P-14 · Archivos (fotos y documentos escaneados)

- **Valor aplicado hoy:** fotos implementadas: hasta 5 por producto, una portada, JPG, PNG o WebP,
  reducidas a unos 1200 px y guardadas en PostgreSQL
  ([ADR-020](../decisions/ADR-020-fotos-de-producto.md)). Los documentos escaneados **no** tienen
  almacenamiento.
- **Por qué se aplicó:** las fotos se resolvieron aparte; los documentos nunca se respondieron.
- **Riesgo si es incorrecto:** quien reciba mercadería no puede adjuntar la factura o la nota del
  proveedor.
- **Pregunta:** ¿se necesita adjuntar documentos escaneados a los ingresos? Aceptar (no por ahora) o
  corregir (sí).
- **Respuesta del responsable:** _se completa en la sesión._

### P-16 · Identidad visual

- **Valor aplicado hoy:** paleta dorada provisional en `apps/web/src/index.css` (`--color-brand-*`). No
  hay logo.
- **Por qué se aplicó:** el cliente no entregó logo ni colores (bloque J sin respuesta).
- **Riesgo si es incorrecto:** hay que repintar la interfaz; el comprobante de Ventas necesita el logo
  (C1, opcional).
- **Pregunta:** ¿se acepta la paleta dorada provisional hasta que se entregue el logo? Aceptar o
  corregir (entregar logo y colores).
- **Respuesta del responsable:** _se completa en la sesión._

### P-18 · Proveedor de hosting, dominio y presupuesto

- **Valor aplicado hoy:** nada contratado. [DEPLOYMENT.md](../deployment/DEPLOYMENT.md) **recomienda**
  Render con PostgreSQL administrado. El responsable indicó el 2026-11-09 (D5) que el despliegue será
  **local**, en la PC donde se ejecutará el sistema, y lo dejó para después.
- **Por qué se aplicó:** es solo una recomendación; la respuesta de D5 la contradice.
- **Riesgo si es incorrecto:** el sistema no podrá ser usado desde Internet, y en una red local hacen
  falta HTTPS (la cookie de sesión es segura por defecto en producción) y copias de respaldo propias.
- **Pregunta:** ¿se confirma el despliegue local en una PC del negocio, sin acceso desde Internet?
  Aceptar o corregir (hosting en Internet).
- **Respuesta del responsable:** _se completa en la sesión._

### P-26 · RPO y RTO aceptables

- **Valor aplicado hoy:** propuesta en [BACKUPS.md](../deployment/BACKUPS.md): pérdida máxima de datos
  de 24 horas en el peor caso (RPO) y recuperación en un máximo de 4 horas (RTO). No hay copias
  implementadas.
- **Por qué se aplicó:** valores orientativos de la propuesta; el cliente no respondió.
- **Riesgo si es incorrecto:** una pérdida o una caída mayores a lo que el negocio tolera; con
  despliegue local, las copias dependen de la PC y de quien la administre.
- **Pregunta:** ¿el negocio tolera perder hasta un día de datos y estar hasta 4 horas sin el sistema?
  Aceptar o corregir (indicar los tiempos).
- **Respuesta del responsable:** _se completa en la sesión._

### P-30 · Cambios de pieza en Ventas

- **Valor aplicado hoy:** existe la base ([ADR-019](../decisions/ADR-019-cambios-de-pieza.md)): permiso
  `inventory:exchange` solo para Administrador y Responsable, sin pantalla de registro; la pieza
  devuelta entra al stock vendible. El responsable dejó los cambios de Ventas «para después»
  (RESOLUCIONES-2026-11-09, F4).
- **Por qué se aplicó:** se decide con el módulo de ventas.
- **Riesgo si es incorrecto:** el Vendedor no puede registrar un cambio en el mostrador, o la pieza
  devuelta se vende sin revisión.
- **Pregunta:** ¿quién registra los cambios (Responsable y Administrador, como hoy) y la pieza devuelta
  vuelve directo al stock vendible? Aceptar o corregir (otro rol o revisión previa).
- **Respuesta del responsable:** _se completa en la sesión._

### P-C1 · ¿El segundo recuento lo hace otra persona?

- **Valor aplicado hoy:** sin restricción: el operador puede ser el mismo o tomar el conteo otro usuario
  (`inventory-counts.service.ts`, reasignación de `operatorId`;
  [ADR-021](../decisions/ADR-021-conteo-a-ciegas-segundo-recuento.md)).
- **Por qué se aplicó:** el cliente no lo exigió.
- **Riesgo si es incorrecto:** la misma persona confirma su propio conteo.
- **Pregunta:** ¿se obliga a que el segundo recuento lo haga una persona distinta? Aceptar (sin
  restricción) o corregir (obligar a otro usuario).
- **Respuesta del responsable:** _se completa en la sesión._

### P-C2 · Hallazgos del conteo

- **Valor aplicado hoy:** los hallazgos (códigos desconocidos o de otra categoría) solo se registran y se
  marcan «regularizados» con una nota; no bloquean la aprobación ni crean productos ni mueven stock.
- **Por qué se aplicó:** lo más simple, sin tocar el stock sin autorización.
- **Riesgo si es incorrecto:** una pieza que existe físicamente queda sin alta, o se aprueba un conteo
  con hallazgos sin resolver.
- **Pregunta:** ¿se acepta que los hallazgos pendientes no bloqueen la aprobación del conteo? Aceptar o
  corregir (bloquear mientras haya pendientes, o crear el producto desde el hallazgo).
- **Respuesta del responsable:** _se completa en la sesión._

### P-C3 · Diferencias grandes en un conteo

- **Valor aplicado hoy:** sin umbrales: aprueba quien tenga `inventory-counts:approve` (Administrador y
  Responsable).
- **Por qué se aplicó:** el cliente (E1) no dio cifras.
- **Riesgo si es incorrecto:** una diferencia muy grande se aprueba sin segundo ojo (ver P-43).
- **Pregunta:** ¿se acepta no tener umbral? Aceptar o corregir (indicar el monto o el porcentaje a
  partir del cual se avisa al Administrador).
- **Respuesta del responsable:** _se completa en la sesión._

## Acta de la sesión

Al terminar, el responsable indica para cada ID si **acepta** o **corrige**. Con esas respuestas se
crea una resolución fechada, se actualiza PENDIENTES.md (🟠 a 🟢 o a la nueva decisión) y se registran
las tareas de corrección que resulten. Fecha de la sesión: _por fijar._

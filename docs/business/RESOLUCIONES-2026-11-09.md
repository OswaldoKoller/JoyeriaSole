# Decisiones comunicadas por el responsable — 2026-11-09 (cuestionario de continuidad)

Registro formal de las respuestas del responsable del proyecto al cuestionario de continuidad del
2026-11-09. Cada respuesta se transcribe con su ID, un enunciado breve, la opción elegida y su
consecuencia técnica. **No se añaden decisiones que el responsable no tomó.**

Notas de lectura:

- Los enunciados son **resúmenes** redactados al registrar la respuesta; el texto original del
  cuestionario no está en el repositorio. Lo que figura como «Respuesta» es lo que el responsable
  eligió o dijo.
- «Consecuencia técnica» es lo que se deduce de la respuesta para el trabajo del equipo. No es una
  decisión nueva; cuando una consecuencia depende de algo no respondido, se indica.
- Donde una respuesta coincide con una opción de las subdecisiones de Ventas, se indica con «equivale
  a SD-xx» ([08-subdecisiones-pendientes](../propuestas/fase-2-ventas/08-subdecisiones-pendientes.md)).
  Esa equivalencia es una lectura del equipo: el cuestionario usaba sus propios identificadores.
- «Resuelta» no significa «implementada». El estado vigente de cada decisión está en
  [PENDIENTES.md](PENDIENTES.md).
- La resolución formal del 2026-11-07 (Q-V07, Q-V09, Q-V12) está en
  [RESOLUCIONES-2026-11-07.md](RESOLUCIONES-2026-11-07.md).
- La pregunta F1 («investiga…») no es una decisión: se atendió con la
  [investigación legal preliminar](../propuestas/fase-2-ventas/09-investigacion-legal-bolivia.md), que
  no es asesoría legal ni tributaria.

## Qué quedó autorizado y qué no

**Autorizado (explícito):**

- **A1 a):** solo la parte (a) de E0, descrita abajo.
- **A2:** guardar la resolución del 2026-11-07 y registrar las decisiones Q-V en la documentación.
- **A3 a):** solo el seed de producción ejecutable y la prueba de arranque de la imagen en el CI.

**NO autorizado (sigue en espera):**

- Idempotencia y garantías nuevas en la base de datos (ver A1 y D3).
- Pantalla o API de gestión de roles, y miniaturas de fotos (ver A3).
- Cualquier implementación del módulo de Ventas o de Caja: las respuestas B y C son **decisiones de
  diseño**; la autorización del 2026-11-07 sigue siendo «solo análisis y planificación» y estas
  respuestas no la amplían.

## A. Autorizaciones de trabajo

- **A1 · Estabilización del libro de inventario (E0).**
  - Enunciado: qué parte de la estabilización previa se autoriza.
  - Respuesta: **a)** autoriza **solo** la parte (a) de E0: unificar el libro. Los ingresos, el stock
    inicial y el borrado de saldos pasan por el servicio de inventario; se valida que la variante esté
    activa bajo bloqueo; se agrega la prueba «saldo = suma de movimientos».
  - Consecuencia técnica: hoy hay tres escritores del libro fuera de `modules/inventory`
    (`stock-entries.service.ts`, `inventory.service.ts` con `initialStock`, y `products.service.ts`
    con `inventoryBalance.deleteMany`) y `stock-ledger.ts` no valida el estado de la variante (ver
    [informe técnico, DT-ARQ-01](../informe-tecnico/06-estado-deuda-y-fase-2.md)).
  - **No autoriza:** idempotencia, ni garantías nuevas en la base de datos todavía. Según D3, la
    implementación de las garantías queda condicionada a que el responsable elija A1 c).
- **A2 · Registrar la resolución del 2026-11-07 y las decisiones Q-V.**
  - Enunciado: si se puede guardar la resolución formal en el repositorio.
  - Respuesta: **Sí.**
  - Consecuencia técnica: este documento, [RESOLUCIONES-2026-11-07.md](RESOLUCIONES-2026-11-07.md), el
    bloque «Ventas (Fase 2)» de [PENDIENTES.md](PENDIENTES.md) y la hoja
    [REVISION-DECISIONES-POR-DEFECTO.md](REVISION-DECISIONES-POR-DEFECTO.md).
- **A3 · Preparación de la puesta en marcha.**
  - Enunciado: qué parte del trabajo de operación se autoriza.
  - Respuesta: **a)** autoriza **solo** un seed de producción ejecutable y una prueba de arranque de
    la imagen en el CI.
  - Consecuencia técnica: el seed de producción (estructura, sin datos de negocio) debe poder
    ejecutarse en un entorno nuevo, y el CI debe levantar la imagen y comprobar que arranca.
  - **No autoriza:** la pantalla o API de gestión de roles (decisión P-46) ni las miniaturas de fotos.

## B. Ventas y caja (Q-V09)

Las ocho subdecisiones de caja que dejó pendientes la resolución del 2026-11-07 quedaron respondidas
(B2 a B9). Esto cierra el diseño funcional de la caja; **no autoriza implementarla**.

- **B1 · Orden de liberación de venta y caja.**
  - Enunciado: si la venta puede habilitarse antes que la caja.
  - Respuesta: **a)** venta y caja se liberan **juntas**.
  - Consecuencia técnica: no se habilita la venta con dinero real sin caja. Resuelve en ese sentido el
    conflicto de orden E1/E3 (C-14 y SD-G11 del paquete de análisis).
- **B2 · Venta sin sesión de caja (equivale a SD-C02 a).**
  - Enunciado: si se puede vender sin una sesión de caja abierta.
  - Respuesta: **No.** No se vende sin sesión de caja abierta.
  - Consecuencia técnica: toda venta pertenece a una sesión; el campo que une venta y sesión no
    necesita ser opcional (ver «Contradicciones con documentos vigentes»).
- **B3 · Quién abre y cierra la caja (equivale a SD-C01 b).**
  - Enunciado: roles que pueden abrir y cerrar la caja.
  - Respuesta: **a)** abren y cierran caja el **Administrador** y el **Responsable de inventario**.
  - Consecuencia técnica: el Vendedor no abre ni cierra. Quién puede **cobrar** (vender) en la caja no
    se respondió (Q-V13 sigue pendiente). La forma de los permisos (uno o dos) es un detalle técnico a
    proponer.
- **B4 · Fondo inicial (equivale a SD-C03 a).**
  - Enunciado: restricciones del fondo inicial.
  - Respuesta: **a)** fondo inicial **obligatorio**, monto **libre**.
  - Consecuencia técnica: la apertura exige indicar un monto, sin cifra fija. Si el cero es válido y si
    hay un tope máximo no se dijo (ver «Pendientes que siguen abiertos»).
- **B5 · Diferencia de arqueo (equivale a SD-C04 a).**
  - Enunciado: tolerancia ante una diferencia entre efectivo esperado y contado.
  - Respuesta: **a)** la diferencia se registra con **observación obligatoria**, **sin tolerancia
    automática**.
  - Consecuencia técnica: toda diferencia distinta de cero se guarda y exige una observación; no hay
    umbral en Bs ni bloqueo del cierre por monto.
- **B6 · Gastos y retiros de caja (equivale a SD-C05 a).**
  - Enunciado: si se registran gastos y retiros de efectivo.
  - Respuesta: **No.** Sin gastos ni retiros de caja en el MVP.
  - Consecuencia técnica: la entidad `cash_movements` (movimientos manuales) no entra en el MVP; el
    efectivo esperado sale del fondo inicial más los cobros en efectivo. Un gasto real hecho con
    efectivo de la caja aparecerá como diferencia.
- **B7 · Reapertura de una caja cerrada (equivale a SD-C06 a).**
  - Enunciado: si una caja cerrada puede reabrirse.
  - Respuesta: **No.** Sin reapertura de caja cerrada.
  - Consecuencia técnica: el cierre es un dato histórico inmutable. Cómo se corrige un error de cierre
    queda sin definir (ver «Contradicciones con documentos vigentes»).
- **B8 · Cierre con cobros por QR o transferencia (equivale a SD-C07 a).**
  - Enunciado: cómo entran los cobros no efectivos en el cierre.
  - Respuesta: **a)** se **informan aparte** y **no afectan el efectivo**.
  - Consecuencia técnica: el arqueo cuenta solo efectivo; los cobros QR y por transferencia se listan
    por separado. Si llevan una referencia obligatoria (SD-G07) no se respondió.
- **B9 · Responsabilidad dentro de la caja compartida (equivale a SD-C08 a).**
  - Enunciado: quién responde por la caja y qué se guarda de cada vendedor.
  - Respuesta: **a)** cada venta guarda **quién la hizo**; el arqueo es **por sesión**, no por
    vendedor.
  - Consecuencia técnica: la venta registra a su vendedor; no hay arqueo ni subtotal obligatorio por
    vendedor.
- **B10 · Numeración del comprobante (equivale a SD-R02 a).**
  - Enunciado: si el correlativo debe ser continuo o puede tener saltos.
  - Respuesta: **a)** numeración por **secuencia**; **puede haber saltos** (a consultar con el
    contador).
  - Consecuencia técnica: se usa una secuencia de la base de datos, como los demás documentos; no se
    construye un contador sin huecos. Si el contador exige continuidad, se reabre. El **formato** del
    correlativo (SD-R01) no se respondió.
- **B11 · Número de factura externa (equivale a SD-G08 b).**
  - Enunciado: si la venta guarda el número de la factura emitida en el sistema externo.
  - Respuesta: **No.** No se guarda el número de factura externa en la venta.
  - Consecuencia técnica: no se agrega la columna opcional `invoice_reference` al modelo de ventas.

## C. Comprobante interno e incidencias (Q-V12, Q-V07)

- **C1 · Datos comerciales del comprobante (equivale en parte a SD-R03 y SD-R08).**
  - Enunciado: qué datos del negocio lleva el comprobante.
  - Respuesta: **«lo que recomiendes»**. El responsable delegó la definición en la recomendación
    técnica: nombre comercial, dirección, teléfono, NIT **opcional** y logo **opcional**.
  - Consecuencia técnica: la plantilla del comprobante usa esos campos; los **valores reales** están
    **PENDIENTES** de entrega por el responsable. La consulta al contador sobre otros datos
    obligatorios (SD-R07) sigue abierta.
- **C2 · Dónde viven los datos comerciales.**
  - Enunciado: cómo se guardan los datos del negocio.
  - Respuesta: **a)** como **configuración en la base de datos**.
  - Consecuencia técnica: hará falta una tabla o registro de configuración (cambio de modelo con
    migración y ADR cuando se autorice). Quién puede editarla no se respondió.
- **C3 · Formato de impresión (equivale a SD-R05 b).**
  - Enunciado: formato por defecto y dónde se recuerda la elección.
  - Respuesta: **a)** formato **A4 por defecto**, recordado **por navegador**.
  - Consecuencia técnica: la preferencia se guarda en el navegador (no en el servidor). Los demás
    formatos propuestos (58 mm, 80 mm, A5) siguen disponibles como opción, según la resolución del
    2026-11-07.
- **C4 · Reimpresión (equivale a SD-R06 b y c).**
  - Enunciado: si se permite reimprimir y cómo se controla.
  - Respuesta: **a)** reimpresión **permitida** con marca **«Copia»** y **registro de auditoría**.
  - Consecuencia técnica: cada reimpresión se audita y sale marcada. Quién puede reimprimir no se
    respondió.
- **C5 · Venta errónea ya confirmada (equivale en esencia a SD-A01 a).**
  - Enunciado: qué hacer con una venta confirmada que resultó errónea.
  - Respuesta: **a)** se registra como **incidencia** y se resuelve **fuera del sistema**: sin ajuste
    de stock y sin documento compensatorio. El responsable **no autorizó** la opción c) (corrección
    por ajuste de inventario).
  - Consecuencia técnica: no se construye ningún mecanismo de reversión ni de corrección de ventas;
    los ajustes de inventario no se usan para deshacer una venta. El stock puede quedar descontado de
    más hasta que un conteo lo detecte. Es coherente con DEC-V07.
- **C6 · Quién reporta y quién ve las incidencias (relacionada con SD-A06).**
  - Enunciado: roles que intervienen en las incidencias.
  - Respuesta: **«El Vendedor y el Responsable de inventario reportan [las incidencias] y el
    Administrador las ve».**
  - Consecuencia técnica: define quién reporta y quién ve. **No define el flujo ni qué ocurre con el
    stock**, ni si el registro es una entidad del sistema o un procedimiento externo.

## D. Datos, operación y seguridad

- **D1 · Reportes mínimos al cierre de la Fase 1 (P-44).**
  - Enunciado: qué reportes entran al cierre de la Fase 1.
  - Respuesta: **a)** reportes **mínimos** al cierre: **CSV de inventario y de movimientos**.
  - Consecuencia técnica: se diseña una exportación CSV de saldos y de movimientos. El valor del
    inventario (solo con `costs:read`) y la exportación de auditoría (P-AUD-1) no se mencionaron:
    quedan sin decidir.
- **D2 · Carga inicial de datos (P-45).**
  - Enunciado: si se construye un importador de archivos.
  - Respuesta: carga **MANUAL**, **sin importador**.
  - Consecuencia técnica: la rebanada S11 (importador) no se construye. La carga inicial se hace por
    las pantallas existentes (fichas, ingresos, stock inicial). El informe técnico advierte que con
    1.000 a 2.000 piezas la carga manual es costosa y propensa a errores.
- **D3 · Garantías de integridad en la base de datos.**
  - Enunciado: qué garantías de base de datos se prefieren.
  - Respuesta: **«la que recomiendes»**. El conjunto recomendado es: **I-01** el saldo coincide con
    el libro de movimientos; **I-02** unicidad por documento y variante; y **quitar el permiso
    TRUNCATE al usuario de la aplicación en producción** en lugar de un trigger
    ([DATABASE.md](../database/DATABASE.md), «Garantías de integridad propuestas»).
  - Consecuencia técnica: queda **elegido el conjunto**, no su implementación. La **implementación sigue
    sin autorizar** hasta que el responsable elija A1 c). Antes de aplicar I-01 hay que ejecutar la
    consulta de reconciliación que describe el documento de base de datos.
- **D4 · Revisión de las decisiones aplicadas por defecto (P-47).**
  - Enunciado: si se dedica una sesión a revisar las decisiones 🟠 y 🟡.
  - Respuesta: **Sí**, revisar en una sesión las decisiones aplicadas por defecto.
  - Consecuencia técnica: material de apoyo en
    [REVISION-DECISIONES-POR-DEFECTO.md](REVISION-DECISIONES-POR-DEFECTO.md). La fecha de la sesión no
    se fijó.
- **D5 · Dónde se desplegará el sistema.**
  - Enunciado: hosting y lugar de ejecución.
  - Respuesta: el despliegue será **LOCAL**, en la **PC donde se ejecutará el sistema** (no en la PC
    de desarrollo). Se deja **para después**.
  - Consecuencia técnica: **contradice** la recomendación de Render de
    [DEPLOYMENT.md](../deployment/DEPLOYMENT.md) y el «acceso desde Internet» de `CLAUDE.md`
    (ver «Contradicciones con documentos vigentes»). A decidir luego: copias de respaldo en el sitio,
    HTTPS y cookies seguras en la red local, y quién y desde dónde puede acceder. No se cambia ninguna
    decisión vigente (P-18 y P-26 siguen pendientes).
- **D6 · Administradores.**
  - Enunciado: cuántos administradores y quiénes.
  - Respuesta: habrá **dos administradores**: **«Claudia»** y **«ADMINI2»**, con la fecha
    **«01/11/26»**. Los correos se entregaron por chat y **no se incluyen en el repositorio**.
  - Aclaración posterior del responsable (2026-11-09): la fecha «01/11/26» es **solo la fecha de alta de
    ese personal** (su incorporación); **no** es la fecha de arranque del sistema. Ya no es ambigua.
  - Consecuencia técnica: coincide con el criterio de cierre «2 administradores» del informe técnico.
    La **fecha de arranque del sistema sigue sin definir** (pendiente aparte).
- **D7 · Verificación en dos pasos (2FA) para administradores.**
  - Enunciado: si los administradores usan 2FA.
  - Respuesta: **No.** Sin 2FA para administradores.
  - Consecuencia técnica: se mantiene P-19 (sin 2FA). Cierra la parte de 2FA de las preguntas F4/F5.
    La contraseña sigue siendo la única barrera de esas cuentas (OD-08 del informe técnico lo
    advertía).

## E. Documentación y versiones

- **E1 · Cómo se enmiendan los ADR aceptados.**
  - Enunciado: qué hacer cuando un ADR aceptado cambia.
  - Respuesta: **a)** con **notas de actualización**, **sin editarlos**.
  - Consecuencia técnica: se sigue el patrón de la nota «Actualización» de ADR-019. El cuerpo aceptado
    no se reescribe.
- **E2 · ROADMAP.md.**
  - Enunciado: qué hacer con el documento de hoja de ruta antiguo.
  - Respuesta: **a)** `ROADMAP.md` se marca como **histórico**.
  - Consecuencia técnica: pendiente de ejecutar (no se hizo en esta tarea): aviso al inicio de
    [ROADMAP.md](../engineering/ROADMAP.md) y revisión de los documentos que lo citan como vigente.
- **E3 · Versión etiquetada.**
  - Enunciado: si se publica una versión con etiqueta.
  - Respuesta: **Sí**: publicar una versión etiquetada (por ejemplo `v0.1.0`) **al cerrar la Fase 1**.
    Todavía no.
  - Consecuencia técnica: ninguna etiqueta ahora. El cierre de la Fase 1 depende de los criterios de
    cierre del informe técnico.
- **E4 · Informe técnico como revisión de seguridad y rendimiento.**
  - Enunciado: qué documento respalda lo que otros documentos llaman «revisión de seguridad y
    rendimiento».
  - Respuesta: **a)** archivar el informe de esta sesión ([docs/informe-tecnico](../informe-tecnico/))
    como esa revisión.
  - Consecuencia técnica: los documentos que citan la revisión deben apuntar a ese informe (acción
    documental pendiente). Ver la salvedad en «Contradicciones con documentos vigentes».

## F. Otros

- **F2 · Facturación de GitHub Actions.** El responsable **revisará** la facturación. Consecuencia: el
  estado del CI remoto queda a la espera de esa revisión.
- **F3 · Docker Desktop.** **Sí**, se enciende Docker Desktop. Consecuencia: se pueden correr las
  pruebas de integración y de arranque de imagen cuando se pidan.
- **F4 · Informativa (sin respuesta).** No era una pregunta de decisión. **E4 de Ventas** (cambios de
  pieza) y **E5 de Ventas** (reportes de ventas) **se dejan para después**. Consecuencia: Q-V08 (con
  P-30) y Q-V15 siguen sin decisión.

## Pendientes que siguen abiertos

**De esta tanda de respuestas:**

- **Valores reales de C1:** nombre comercial, dirección, teléfono, NIT (opcional) y logo (opcional).
- **Fecha de arranque del sistema:** sin definir. La fecha «01/11/26» de D6 es solo la fecha de alta
  del personal administrador, no el arranque. Los correos de los administradores quedan fuera del
  repositorio.
- **Hosting y entorno (D5):** dónde queda la PC, quién la administra, copias de respaldo en el sitio,
  HTTPS en la red local, acceso desde fuera (F4) y objetivos de pérdida y recuperación (P-18, P-26).
- **Incidencias (C5, C6):** quién reporta y quién ve ya está definido; **falta el flujo** (quién
  atiende, cómo se cierra una incidencia, dónde queda el registro) y **qué pasa con el stock**.
  Aclarar si una venta nueva «compensatoria» cuenta como «documento compensatorio» (excluido por C5).
- **Caja:** si el fondo inicial puede ser cero y si tiene tope (B4); cómo se corrige un error de cierre
  (B6, B7); quién cobra (Q-V13). Además, el Responsable de inventario abre y cierra caja (B3) y a la
  vez aprueba ajustes, precios y conteos (P-43): se concentran funciones; el responsable debe
  conocerlo.
- **Comprobante:** formato del correlativo (SD-R01), identificación del vendedor en el comprobante
  (SD-R04), quién puede reimprimir (C4), quién edita los datos comerciales (C2) y requisitos del
  contador (SD-R07, B10).
- **Garantías de base de datos y E0:** el responsable debe elegir A1 c) para autorizar I-01, I-02 y la
  restricción de TRUNCATE (D3); la idempotencia sigue sin autorizar.
- **Reportes (D1):** valor del inventario y exportación de auditoría (P-AUD-1).
- **Operación:** pantalla de gestión de roles (P-46) y miniaturas, no autorizadas (A3).
- **Sesión de revisión (D4):** fecha y participantes.
- **Cierre de la Fase 1 (E3):** cuándo se publica la versión etiquetada.

**De las subdecisiones de Ventas que no se preguntaron o no se respondieron** (detalle en
[08-subdecisiones-pendientes](../propuestas/fase-2-ventas/08-subdecisiones-pendientes.md)):

- Q-V06 descuentos, Q-V10 clientes, Q-V11 stock negativo en ventas, Q-V14 ventas retroactivas, Q-V16
  venta bajo costo, Q-V17 otros canales.
- SD-A02 pagos incorrectos, SD-A03 duplicaciones, SD-A04 devoluciones obligatorias por ley, SD-A05
  cambios frente a la prohibición, SD-A07 corrección del stock tras una venta errónea (C5 va en ese
  sentido, pero no se preguntó así), SD-A08 reportes de incidencias.
- SD-G07 medios de pago configurables y referencia obligatoria, SD-G09 («precio neto» frente a
  Q-V03), SD-G10 (qué es la Fase 3 tras Q-V02), SD-G12 y SD-G13.
- Cambios de pieza (E4, SD-X01 a SD-X07, P-30) y reportes de Ventas (E5): diferidos (F4).
- Consulta al contador y a un asesor legal (SD-A04, SD-R07, SD-G09, SD-C07).

## Contradicciones con documentos vigentes que esto genera

Esta tarea no modificó los documentos citados en esta sección; son avisos para decidir qué se
actualiza y quién lo hace.

- **D5 frente a la infraestructura documentada.** [DEPLOYMENT.md](../deployment/DEPLOYMENT.md)
  recomienda Render; `CLAUDE.md` habla de «acceso desde Internet»; [LOCAL.md](../deployment/LOCAL.md)
  dice «Nunca usarlo con datos reales» porque no tiene HTTPS ni copias. Además, `COOKIE_SECURE` es
  verdadero por defecto en producción: sin HTTPS, el inicio de sesión desde otro equipo de la red
  local no funciona, y [BACKUPS.md](../deployment/BACKUPS.md) supone una copia externa.
- **B2 frente a las propuestas de Ventas.** Los documentos
  [03](../propuestas/fase-2-ventas/03-modelo-de-datos-ventas-y-caja.md) y
  [08](../propuestas/fase-2-ventas/08-subdecisiones-pendientes.md) y el informe técnico preveían
  `cash_session_id` opcional («hasta E3»). Con B2, la sesión es obligatoria.
- **B1 frente al orden E1 antes de E3.** El informe técnico y la resolución del 2026-11-07 ordenan E1
  antes de E3; con B1 se liberan juntas.
- **B6 y B7 entre sí.** La opción SD-C06 a) corrige un cierre «con un nuevo movimiento de caja»; B6
  excluye esos movimientos. Sin reapertura ni movimientos manuales no hay vía de corrección.
- **C5 frente a ADR-017 y ADR-019.** [ADR-017](../decisions/ADR-017-ajustes-solicitud-aprobacion.md)
  (motivo «Error de registro») y [ADR-019](../decisions/ADR-019-cambios-de-pieza.md) (corregir un
  cambio con un cambio inverso o un ajuste aprobado) siguen vigentes como vía de corrección de
  inventario; C5 las excluye para corregir **ventas**. No se editan (E1): se aclararía con una nota de
  actualización.
- **D2 frente al importador previsto.** El PLAN (rebanada S11), el criterio C-5 y la alternativa A de
  OD-06 del informe técnico y las preguntas H1 a H3 del cuestionario preveían un importador.
- **D7 frente a P-19 y OD-08.** La fila P-19 de PENDIENTES dice que «la pregunta de 2FA sigue sin
  respuesta», y OD-08 recomienda 2FA para administradores antes de E1. Ambas quedan desactualizadas en
  ese punto.
- **E2 frente a los documentos que citan `ROADMAP.md`.** `README.md`, `AGENTS.md`, `docs/README.md`,
  `docs/engineering/HARNESS.md` y `PHASE-1-PREPARATION.md` lo citan como vigente.
- **E4 frente a lo que cita el PLAN.** `F1-ANALISIS-FASES-2026-10-13.md` y el PLAN hablan de «pruebas
  ofensivas» y mediciones de rendimiento (sección «Revisión ofensiva» de `SECURITY.md` y
  `PERFORMANCE.md`), que no existen. El informe técnico **no** ejecutó pruebas ni mediciones: archivarlo
  como esa revisión no respalda esas afirmaciones concretas, y conviene reescribirlas.
- **E1 frente a `docs/decisions/README.md`.** Ese índice dice que los ADR aceptados se reemplazan por
  uno nuevo; E1 admite además notas de actualización.
- **`CLAUDE.md`.** Su «Fase actual», la prohibición de punto de venta y su lista de ADR están
  desactualizadas respecto de la Fase 2. Solo el responsable puede autorizar su cambio.
- **D3 y A1.** No contradice [DATABASE.md](../database/DATABASE.md) (coincide con su recomendación de
  revocar `TRUNCATE`), pero depende de A1: con escrituras fuera del servicio de inventario, el
  trigger I-01 fallaría.

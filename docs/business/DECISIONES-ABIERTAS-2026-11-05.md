# Decisiones abiertas tras la reunión del 2026-11-05

> **Superado por la sección 7 de [RESOLUCIONES-2026-11-05](RESOLUCIONES-2026-11-05.md) y por el estado vigente de [PENDIENTES.md](PENDIENTES.md).** Las preguntas Q-xx de este documento ya fueron respondidas; donde difiere (por ejemplo, Q-01: quién aprueba), prevalece la regla de autorización compartida.

Lo que **no** quedó claro en las respuestas del cliente, convertido en opciones concretas según la
estructura actual del sistema. Contexto: [RESOLUCIONES-2026-11-05.md](RESOLUCIONES-2026-11-05.md).
Plan que depende de estas respuestas: [PLAN-DESARROLLO-F1-2026-11.md](../engineering/PLAN-DESARROLLO-F1-2026-11.md).

**Nota posterior (2026-11-05):** después de responder Q-01 B y D4, el cliente fijó una regla de
autorización compartida: el Administrador **y** el Responsable de inventario pueden autorizar (ajustes,
precios, stock inicial, conteos). Donde este documento dice que «solo el Administrador» aprueba ajustes o
precios, prevalece esa regla; ver la sección 7 de [RESOLUCIONES-2026-11-05.md](RESOLUCIONES-2026-11-05.md).

**Cómo responder:** basta una línea por pregunta (por ejemplo `Q-01 B · Q-02 A · Q-03 A`). La opción
marcada **(Recomendada)** es la que mejor encaja con lo ya construido y con lo que el cliente dijo; si
no hay objeción se adopta. Una opción no elegida no se implementa.

**Prioridad:** 🔴 bloquea una rebanada del plan · 🟠 hace falta antes de producción · 🟢 menor.

| ID   | Tema                                       | Prio | Bloquea                 |
| ---- | ------------------------------------------ | ---- | ----------------------- |
| Q-01 | Quién aprueba ajustes y conteos (P-01)     | 🔴   | S6 Ajustes, S8 Conteo   |
| Q-02 | Sesión de 8 h: fija o con inactividad      | 🟠   | S1 Reglas base          |
| Q-03 | Número de serie (P-17)                     | 🔴   | S2 Catálogo             |
| Q-04 | Redondeo del precio                        | 🔴   | S7 Precios              |
| Q-05 | Multiplicador: valor inicial y nivel       | 🔴   | S7 Precios              |
| Q-06 | Cómo se mide la ganancia                   | 🔴   | S7 Precios              |
| Q-07 | Compras en dólares y tipo de cambio (P-10) | 🔴   | S5 Ingresos v2          |
| Q-08 | Costos de importación (aduana, comisiones) | 🔴   | S5 Ingresos v2          |
| Q-09 | Fotos: dónde se guardan (P-14)             | 🔴   | S3 Fotos                |
| Q-10 | Etiquetas y códigos de barras              | 🟠   | S2 Catálogo (etiquetas) |
| Q-11 | «Disposición para venta»                   | 🟠   | S9                      |
| Q-12 | Cambios de mercadería (sin devoluciones)   | 🟠   | S9                      |
| Q-13 | Conteos simultáneos                        | 🔴   | S8 Conteo               |
| Q-14 | Aviso de pendientes al administrador       | 🟢   | S6, S8                  |
| Q-15 | Celdas ❓ de la matriz de permisos         | 🟠   | S1, S8                  |

---

## Q-01 🔴 ¿Quién aprueba ajustes manuales y conteos? (P-01, E1, E6)

**Por qué está abierta.** El cliente dijo «el administrador aprueba todo» (P-01), pero en E6 dijo que
el conteo lo aprueba «el responsable o el administrador», y la matriz F3 deja al responsable con ✔.
Hoy el rol Responsable tiene `inventory:adjust` e `inventory-counts:approve`.

- **A.** El Administrador aprueba todo (ajustes y conteos). El Responsable registra, solicita y cuenta.
- **B. (Recomendada)** **Conteos:** aprueba el Responsable **o** el Administrador (como dijo en E6).
  **Ajustes manuales:** los aprueba el Administrador; el Responsable los solicita. Respeta ambas frases
  del cliente.
- **C.** El Responsable aprueba lo suyo hasta un umbral (Bs o unidades); lo que lo supere lo aprueba
  el Administrador. Requiere que el cliente fije los valores del umbral (en E1 los dejó en blanco).
- **D.** El Responsable aprueba todo; el Administrador solo recibe aviso (decisión del 2026-10-11).

**Subpregunta (ajustes):** ¿el stock cambia al _registrar_ el ajuste o solo al _aprobarlo_?

- **a. (Recomendada)** Solo al aprobarlo: coincide con la regla del proyecto («los ajustes requieren
  autorización») y evita salidas de stock sin autorizar.
- **b.** Se aplica al registrarlo y el Administrador lo revisa después (se corrige con un ajuste inverso).

**Efecto en el sistema.** B/A: se parte el permiso actual en `inventory:adjust` (solicitar) y
`inventory:adjust-approve` (aprobar). Aparece un estado «pendiente» en ajustes. Con B, el umbral de E1
solo serviría para resaltar diferencias grandes de un conteo (opcional; no hace falta fijar cifras).

## Q-02 🟠 Sesión de 8 horas

Cambia de 3 h a 8 h. ¿Cómo se cuenta?

- **A. (Recomendada)** Fija: 8 h desde el inicio de sesión, sin extensión (misma mecánica que hoy,
  solo cambia la duración).
- **B.** 8 h máximo + cierre automático tras 60 minutos sin actividad (más seguro en un PC compartido).
- **C.** 8 h que se renuevan con la actividad (la sesión nunca vence mientras se use).

**Efecto.** Constante de configuración + pruebas + actualizar ADR-003 y `CLAUDE.md`. B agrega un
campo de última actividad.

## Q-03 🔴 «Por número de serie» (P-17)

**Por qué está abierta.** El cliente respondió «por número de serial», pero también «toda pieza es
individual» (B3) y el registro dice que no se controlan series. ¿Qué quiso decir?

- **A. (Recomendada)** Se mantiene: **sin control por serie**. «Serial» se refiere al código con que
  se identifica cada pieza (SKU + código de barras / del proveedor), que ya existe.
- **B.** Un campo opcional «N.º de serie / referencia del fabricante» en la variante, de texto libre
  y buscable, **sin** controlar existencias por serie.
- **C.** Control real por unidad: cada pieza física es una fila con su número de serie único (el stock
  de una variante sería la cantidad de unidades activas). Cambia el modelo de inventario y todos los
  flujos; solo se justifica para artículos de alto valor.

## Q-04 🔴 Redondeo del precio de venta (P-03)

El cliente dio: «204 → 205; 206 → 210» (siempre hacia arriba) y «114,7 → 115 o 120». **Todos los
ejemplos son hacia arriba**; solo cambia la palabra «más cercano». Propuesta de reglas por pieza:

| Regla                      | 204 | 206 | 114,7  |
| -------------------------- | --- | --- | ------ |
| Sin redondeo (exacto)      | 204 | 206 | 114,70 |
| Hasta múltiplo de **5** ↑  | 205 | 210 | 115    |
| Hasta múltiplo de **10** ↑ | 210 | 210 | 120    |

- **A. (Recomendada)** Estas tres reglas, **siempre hacia arriba**; un valor que ya es múltiplo no
  cambia (205 → 205). Valor inicial al calcular: «múltiplo de 5». El usuario elige la regla en cada
  producto.
- **B.** Igual que A pero con opciones «más cercano» (114,7 → 115 con múltiplo de 5; → 110 con
  múltiplo de 10).
- **C.** Solo una regla global (múltiplo de 5 hacia arriba), sin elegir por producto.

## Q-05 🔴 Multiplicador: valor inicial y dónde se guarda

El cliente fija el precio ítem por ítem, pero quiere poder usar multiplicador y redondeo (y él mismo
notó que esto parece contradictorio).

- **A. (Recomendada)** Un valor inicial global **×2** (el de P-03) que el administrador puede cambiar;
  en cada producto se puede usar otro multiplicador. El precio se guarda siempre por **variante**; en
  la pantalla del producto se puede aplicar a todas sus variantes a la vez. Se registra qué
  multiplicador y qué regla se usaron.
- **B.** Multiplicador por **categoría** con excepción por producto (así lo dejó prototipado Codex).
- **C.** Sin multiplicador guardado: la pantalla ofrece una calculadora (costo × factor + redondeo) y
  el usuario escribe el precio final.

El cálculo parte del **costo total** (compra + transporte + embolsado + aduana + comisiones + extras,
ya prorrateados). La sugerencia es solo visual (D3): nunca cambia el precio sola.

## Q-06 🔴 ¿Cómo se mide la ganancia?

El cliente cuenta su ganancia sobre el costo («gana 50 %, hasta 250 %»).

- **A. (Recomendada)** Mostrar **Ganancia en Bs** y **% sobre el costo total** (precio 150 con costo
  100 → 50 Bs y 50 %). Visible solo con permiso de costos.
- **B.** Mostrar margen sobre el precio (50 sobre 150 → 33 %).
- **C.** Mostrar ambos porcentajes.

## Q-07 🔴 Compras en dólares y tipo de cambio (reabre P-10)

El proveedor de China cotiza en dólares y hay que registrar el tipo de cambio.

- **A. (Recomendada)** Cada **ingreso** declara su moneda de compra (Bs o USD). En USD se digita el
  tipo de cambio de ese ingreso (Bs por dólar) y los precios por pieza en USD. El sistema guarda el
  precio en USD, el tipo de cambio y el equivalente en Bs; **costos, stock y precios se llevan en Bs**.
  El tipo de cambio queda fijo al confirmar.
- **B.** Todo en Bs: el cliente convierte fuera; el sistema solo guarda como notas el precio en USD y
  el tipo de cambio, sin calcular.
- **C.** Multimoneda completa (otras monedas, tabla de tipos de cambio por fecha). Mayor alcance.

Pregunta rápida: ¿también compran en **yuanes (CNY)** o en otra moneda? (Se asume solo dólares.)

## Q-08 🔴 Costos de importación (aduanización, comisiones, otros)

- **A. (Recomendada)** Lista abierta de costos por ingreso: cada línea tiene un **tipo** (Transporte,
  Embolsado, Aduanización, Comisiones, Otro; el administrador puede agregar tipos) y un monto en Bs.
  Se reparten por valor de compra (ADR-015, sin cambios) y el costo total sale «en base a todo».
- **B.** Columnas fijas: se agregan «aduanización» y «comisiones» a las tres que ya existen.
- **C.** Como A, pero cada costo puede estar en USD o Bs (se convierte con el tipo de cambio del ingreso).

Subpregunta: ¿aduana y comisiones se conocen como **monto** (recomendado) o como **porcentaje** del
valor de compra (el sistema calcularía el monto)?

## Q-09 🔴 Fotos de producto (P-14)

El cliente quiere fotos. Hoy la API solo recibe JSON, así que hay que elegir dónde guardarlas.

- **A.** Disco del servidor: lo más simple, pero se pierde si el contenedor se recrea sin volumen y
  exige respaldar aparte.
- **B.** Almacenamiento de objetos (Cloudflare R2, compatible con S3): copia segura y barata a esta
  escala; requiere una cuenta a nombre del cliente (pregunta I1, sin responder).
- **C. (Recomendada para empezar)** Dentro de PostgreSQL, con la imagen reducida: no depende de
  cuentas pendientes y entra en las copias de seguridad de la base. Con 250 productos y pocas fotos
  son ~100–200 MB. El código usa una interfaz de almacenamiento, de modo que pasar a B es un cambio
  de configuración.

Subpreguntas con propuesta: nivel **producto** (no por variante) · hasta **5** fotos por producto, una
principal · JPG/PNG/WebP de hasta 5 MB, reducidas a ~1200 px · puede subir quien tenga
`catalog:manage` · al crear una pieza nueva dentro de un ingreso se puede adjuntar su foto.

## Q-10 🟠 Etiquetas y códigos de barras (P-06, B5, B7)

**Q-10a — ¿Etiqueta propia para todas las piezas o solo las que no traen código?**

- **A. (Recomendada)** Para **todas**: el SKU es el criterio único de búsqueda en ventas; el código del
  proveedor sigue siendo escaneable como alternativo.
- **B.** Solo para las piezas sin código del proveedor.

**Q-10b — Código del proveedor repetido.** El código de barras es único en el sistema; dos
proveedores podrían usar el mismo número para piezas distintas.

- **A. (Recomendada)** El sistema avisa, no lo guarda como código de barras y deja la pieza
  identificada por su SKU (el código del proveedor se conserva en la relación proveedor-pieza).
- **B.** Permitir repetidos y pedir elegir al escanear (más complejo y propenso a errores).

**Q-10c — Impresión.** (Impresora y papel aún no definidos.)

- **A. (Recomendada)** Impresión desde el navegador con tamaño de etiqueta configurable (ancho × alto
  en mm); funciona con cualquier impresora y se ajusta cuando se defina el rollo.
- **B.** Comandos nativos de una marca concreta (requiere el modelo).
- **C.** Hoja A4 de etiquetas en PDF.

**Q-10d — Piezas muy pequeñas** (decisión física del cliente, no del sistema): etiquetar la bolsa o
tarjeta, usar etiqueta tipo banderín, o no etiquetar y buscar por SKU/foto. El sistema funciona igual
en los tres casos. Registrar la elección.

## Q-11 🟠 «Disposición para venta» (A1, último paso)

El flujo termina en «conteo físico y luego disposición para venta».

- **A. (Recomendada)** Sin estado nuevo: en la Fase 2 una variante será vendible si está activa, con
  precio mayor a 0 (D9) y con stock.
- **B.** Estado «En preparación → Disponible»: lo ingresado queda «En preparación» hasta que el
  Responsable lo libere a mano, tras revisar precio y conteo.
- **C.** Igual que B, pero se libera solo cuando se aprueba un conteo que cubre esas piezas.

B y C añaden un estado, una bandeja de liberación y pruebas; A puede ampliarse a B más adelante sin
rehacer datos.

## Q-12 🟠 Cambios de mercadería (C9: sin devoluciones)

Diseño propuesto: un **cambio** es un documento con dos movimientos en la misma transacción —entrada
de la pieza que vuelve y salida de la que se lleva—, ambos con la misma referencia. Como todo pasa por
el libro de movimientos, el stock, los conteos y los ajustes cuadran solos. Se reemplaza el tipo
reservado `CUSTOMER_RETURN` por `EXCHANGE_IN` / `EXCHANGE_OUT`.

**Pieza que vuelve:**

- **A. (Recomendada)** Entra al stock vendible; si viene dañada se registra después un ajuste de pérdida.
- **B.** Entra a un estado «pendiente de revisión» (contradice E2: sin estados intermedios).

**Qué se construye en la Fase 1:**

- **a. (Recomendada)** Solo la base: tipos de movimiento, operación interna atómica de movimiento
  doble, ADR y pruebas. Sin pantallas (las usará el módulo de ventas).
- **b.** Además una pantalla interna «Registrar cambio» (adelanta parte de la Fase 2).

## Q-13 🔴 Conteos simultáneos (E3)

- **A.** Uno a la vez en toda la tienda.
- **B. (Recomendada)** Varios a la vez si sus categorías **no se solapan**; el sistema lo valida
  (contar «Anillos» y «Anillos de plata» a la vez se rechaza).
- **C.** Libre: puede haber doble conteo de una misma pieza.

## Q-14 🟢 Aviso de pendientes al administrador (E1)

- **A. (Recomendada)** Bandeja «Pendientes de aprobación» con contador en el inicio del administrador
  (ajustes, cambios de precio, conteos). Sin correo.
- **B.** Lo anterior más correo (requiere un servicio de correo; serviría también para recuperar
  contraseñas).
- **C.** Sin aviso: solo se revisa la auditoría.

## Q-15 🟠 Celdas ❓ de la matriz de permisos (F3)

D4 ya resolvió: Responsable **solicita** precio (sí) y **no aprueba** (solo Administrador).

| Pregunta                                        | Opciones                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vendedor: ¿puede **capturar** en un conteo?     | **A. (Recomendada)** No · B. Sí, rol «solo captura» sin aprobar                                            |
| Vendedor: ¿ve el **inicio/tablero**?            | **A. (Recomendada)** Sí, sin costos ni valores · B. No, solo catálogo y stock                              |
| Responsable: ¿ve la **auditoría**?              | **A. (Recomendada)** Solo el Administrador · B. También el Responsable (solo lectura)                      |
| ¿Roles adicionales (auditor, auxiliar, cajero)? | **A. (Recomendada)** Ninguno por ahora; los roles se pueden crear luego sin reprogramar · B. Definir ahora |

---

## Decisiones delegadas que el equipo toma por defecto

El cliente dijo «como mejor veas». Se aplican estas propuestas; se corrigen si hay objeción.

**B2 — Atributos.** «Variante» = genera SKU y stock separados; «Descriptivo» = dato informativo del
producto. Obligatoriedad por categoría: ninguna al inicio (C1 permite fichas incompletas); se
configura al cargar las categorías.

| Atributo       | Tipo propuesto | Nota                                                              |
| -------------- | -------------- | ----------------------------------------------------------------- |
| Material       | Variante       | Plata 925, acero, dorado…                                         |
| Color          | Variante       |                                                                   |
| Talla          | Variante       | Anillos                                                           |
| Tamaño         | Variante       |                                                                   |
| Longitud (cm)  | Variante       | Cadenas, pulseras                                                 |
| Tono           | Descriptivo    | Pasa a variante si venden la misma pieza en varios tonos          |
| Piedra         | Descriptivo    | Pasa a variante si una misma pieza se vende con distintas piedras |
| Acabado        | Descriptivo    |                                                                   |
| Tipo de cierre | Descriptivo    |                                                                   |
| Género         | Descriptivo    |                                                                   |
| Colección      | Descriptivo    |                                                                   |
| Dimensiones    | Descriptivo    | Texto libre                                                       |

**B4 — Nombre del producto.** `<Tipo de pieza> <rasgo principal> <modelo>`, sin repetir lo que ya está
en atributos ni en la variante. Ejemplos: «Anillo corazón con circonia», «Cadena cubana». La etiqueta
de variante («Plata 925 / Talla 16») la genera el sistema. Máximo 200 caracteres.

**C8 — Ficha de proveedor.** Nombre o razón social (obligatorio) · tipo (nacional / del exterior) ·
país · NIT o identificador fiscal · persona de contacto · teléfono · WhatsApp · correo · dirección ·
moneda habitual de compra (Bs/USD) · condiciones de pago (texto libre) · notas · estado. Solo el nombre
es obligatorio.

**Otras:**

- Las piezas creadas desde un ingreso con datos mínimos muestran una marca **«Ficha incompleta»** en el
  listado y un contador en el inicio hasta completarse (C1: no se bloquean).
- Historial de costos (C10): se obtiene de los ítems de ingresos confirmados, sin tabla nueva.
- Las acciones del Administrador sobre precios (modificación directa) quedan en el historial de precios
  como «aprobadas por él mismo».

---

## Decisiones de gestión (para quien desarrolla, no para el cliente)

**G-01 — Pull requests abiertos (#1–#4).** Están apilados: #4 contiene #3, #2 y #1.

- **A. (Recomendada)** Fusionarlos a `develop` en orden #1 → #4 (CI de #4 ya está verde) antes de abrir
  trabajo nuevo.
- **B.** Fusionar solo #4 (arrastra los tres).
- **C.** Dejarlos abiertos (cada rebanada nueva nacería sobre una rama sin integrar).

**G-02 — Trabajo de Codex sin publicar** (rama `backup/wip-2026-10-11`, 61 archivos). Contiene su
propia versión de ingresos, precios (multiplicador por categoría, propuestas con aprobación) y conteos
con ciclo de estados, más tres migraciones. Hay **dos implementaciones de ingresos en conflicto** (la de
#4 y la suya) y varias reglas que esta reunión cambió.

- **A. (Recomendada)** Tratarlo como **referencia**: se conserva intacto en una rama de archivo; cada
  rebanada revisa su parte y reutiliza lo que sirva, con pruebas, sobre `develop`.
- **B.** Fusionarlo y adaptarlo (rápido, pero arrastra reglas ya superadas y exige QA completo).
- **C.** Descartarlo.

**G-03 — Ramas de documentación.** `docs/analisis-fases-pendientes` (análisis, cuestionario y estos
tres documentos) y `feat/despliegue-local` están sin publicar. Propuesta: subirlas y abrir un PR cada
una **solo cuando se pida**.

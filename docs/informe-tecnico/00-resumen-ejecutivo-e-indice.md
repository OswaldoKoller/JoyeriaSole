# Informe técnico completo · Joyería Sole

Estado al **2026-11-07**, sobre `main` (`e4494a3`, integración de la Fase 1) más una corrección pendiente de
commit (ver §3). Ámbito: sistema web de inventario y control de productos de una joyería (Bolivia), Fase 1, y el
plan de la Fase 2 «Ventas».

Este documento es la puerta de entrada. Resume lo esencial y enlaza las seis secciones de detalle. Cada sección fue
elaborada por un agente especializado leyendo el código y la documentación reales del repositorio, y cita archivo y
línea como evidencia.

## Índice de las secciones

| N.º | Sección                                                                 | Qué contiene                                                                                                                                                                                                                        | Líneas |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| 01  | [Historia, decisiones e incoherencias](01-historia-y-decisiones.md)     | Cronología desde el primer commit, los 21 ADR, el registro de decisiones de negocio (P-xx, Q-xx), reglas vigentes, **44 incoherencias** entre documentos y código, estado de la documentación y lista priorizada de correcciones    |    762 |
| 02  | [Arquitectura y estructura](02-arquitectura-y-estructura.md)            | Estilo arquitectónico, árbol del repositorio, backend (plugins, módulos, variables de entorno), paquete compartido, seguridad como arquitectura, operación (Docker, CI, despliegue), rendimiento, dependencias y evaluación crítica |    894 |
| 03  | [API y servicios](03-api-y-servicios.md)                                | Convenciones, **catálogo de los 101 endpoints** con permiso, entradas y salidas, servicios y reglas de negocio, flujos de punta a punta, errores, pruebas del backend                                                               |  1.119 |
| 04  | [Modelo de datos](04-modelo-de-datos.md)                                | 34 tablas, 15 enums, 17 migraciones, 47 CHECK y 8 triggers, invariantes, seed, consultas, retención de datos y preparación para Ventas                                                                                              |  1.409 |
| 05  | [Frontend, pruebas y calidad](05-frontend-y-pruebas.md)                 | Rutas, features, componentes compartidos, accesibilidad, rendimiento, inventario de las 758 pruebas, CI real y deuda del frontend                                                                                                   |    875 |
| 06  | [Estado, deuda técnica, opciones y Fase 2](06-estado-deuda-y-fase-2.md) | Estado ejecutivo, cierre de Fase 1, **registro de deuda (93 abiertos o parciales)**, 18 decisiones por tomar, plan de la Fase 2 en etapas, hoja de ruta y riesgos                                                                   |  1.195 |

## 1. Qué es el sistema, en una página

- **Producto.** Inventario para joyería y productos de moda: catálogo con variantes, SKU y códigos de barras,
  fotos, proveedores, ingresos con costos (también en dólares), precios con aprobación, ajustes, conteo físico a
  ciegas, cambios de pieza (solo base), auditoría y usuarios con roles.
- **Arquitectura.** Monolito modular en un monorepo (npm workspaces). Un solo contenedor: la API (Fastify 5,
  TypeScript, Prisma 7, PostgreSQL 18) también sirve la SPA (React 19, Vite, Tailwind 4, TanStack Query). El
  paquete `packages/shared` comparte permisos, códigos de error y esquemas Zod entre API y web.
- **Principios que se cumplen.** El stock vive por variante y nunca se edita: todo cambio es un movimiento en un
  libro de solo inserción, en la misma transacción que el saldo. Las acciones importantes quedan en auditoría.
  La seguridad se aplica en la API (la UI solo oculta). Las decisiones del cliente sin confirmar no se convierten
  en reglas.

## 2. Cifras del repositorio (medidas)

| Métrica                                               |                                                                                     Valor |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------: |
| Módulos de la API / archivos de rutas / **endpoints** |                                                                         11 / 19 / **101** |
| Tablas / enums / migraciones                          |                                                                              34 / 15 / 17 |
| Permisos / roles iniciales                            |                                     24 / 3 (Administrador 24, Responsable 18, Vendedor 2) |
| Líneas de código (con pruebas y migraciones)          |                                                                  ≈ 49.000 en 310 archivos |
| **Pruebas**                                           | **758**: 490 de API (140 unitarias y 350 de integración), 209 de componentes web y 59 E2E |
| ADR aceptados                                         |                                                                                        21 |
| Carga inicial de la web                               |                                        530 kB de JS (≈ 162 kB comprimido), antes ≈ 851 kB |
| Tiempo del CI                                         |                                 job de calidad entre 14 y 20 min; imagen Docker ≈ 3,7 min |

Aclaración de cifras: la sección 06 cuenta 732 pruebas por declaraciones `it(`/`test(`; la sección 05 y este
resumen usan 758, que coincide con la salida de Vitest y Playwright (el recuento por texto no cuenta cada caso de
`it.each`). No hay cobertura instrumentada, así que **no se afirma ningún porcentaje de cobertura**.

## 3. Hallazgo posterior a la integración: el CI de `main` falló

La ejecución del CI en `main` tras fusionar el PR #7 **terminó en rojo** (la del propio PR había pasado). El fallo
está en el E2E `s2-catalog-complete.spec.ts` y tiene dos causas distintas, ambas intermitentes:

| Causa                                                                                                                        | Naturaleza                                                                                                                                                                                                                                                                          | Estado                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Dos botones «Guardar valor» a la vez: la prueba abría el siguiente formulario antes de que el anterior terminara de cerrarse | Carrera de la prueba                                                                                                                                                                                                                                                                | Corregida en `apps/web/e2e/s2-catalog-complete.spec.ts` (espera a que el formulario se cierre)                                     |
| La ficha «E2E Anillo repetido» no aparecía tras filtrar por «Fichas incompletas»                                             | **Error real de la aplicación**: en Productos, la búsqueda por código termina tarde y reescribía la URL con los filtros de un render anterior, borrando el filtro cambiado mientras esperaba. También le habría pasado a una persona que cambie un filtro con una búsqueda en curso | Corregida en `products-page.tsx` (lee la URL vigente desde una referencia) con una prueba de regresión que falla sin la corrección |

Nota técnica: mi primera corrección (forma funcional de `setSearchParams`) **no bastaba**; la prueba nueva lo
demostró, porque esa forma parte de los parámetros del render que creó la función. La corrección vigente es la
referencia a la URL actual.

**Estado:** las pruebas del catálogo pasan (94 de 94) y la validación del E2E está en curso. **Los cambios están
en el árbol de trabajo, sin commit ni PR**, junto con este informe. Hasta fusionarlos, `main` conserva el defecto.
Además, el CI de `develop` también falló en la ejecución del PR #5 por la misma prueba: ya era intermitente.

## 4. Estado de la Fase 1

**Funcionalmente construida; formalmente sin cerrar.** De los 11 criterios de cierre propuestos (C-1 a C-11),
ninguno está plenamente cumplido y verificado: 3 parciales (seguridad, documentación, rendimiento), 1 sin
comprobar (CI verde sostenido) y 7 sin cumplir. Lo que falta es en su mayoría ajeno al código:

| Bloque     | Qué falta                                                                                                                                                                         | Quién                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Producto   | Reportes y exportaciones, importación de datos, gestión de roles (API/pantalla)                                                                                                   | Decisión del cliente y desarrollo |
| Operación  | Hosting y dominio, copias de respaldo externas con una restauración ensayada, observabilidad, usuarios reales (≥ 2 administradores), datos reales y conteo físico de verificación | Cliente e infraestructura         |
| Aceptación | Acta firmada por módulo, manual de usuario, guía de contingencia en papel, capacitación y período en paralelo                                                                     | Cliente y equipo                  |
| Decisiones | 15 decisiones 🟠 aplicadas por defecto sin aceptación expresa y 9 🟡                                                                                                              | Cliente                           |

## 5. Lo más importante que está abierto

Resumen de la deuda técnica; el registro completo con evidencia, esfuerzo y recomendación está en la sección 06 §3.
De los 93 puntos abiertos o parciales, 7 son de severidad Alta y **ninguno es de seguridad**.

| Prioridad                            | Tema                                                                                                                                                            | Por qué importa                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Alta                                 | **El libro de inventario tiene dos escritores fuera del servicio de inventario** (`stock-entries.confirm`, `inventory.initialStock`) y el catálogo borra saldos | Rompe la regla de CLAUDE.md y el ADR-007; Ventas sería el cuarto escritor    |
| Alta                                 | El ledger no valida que la variante esté activa bajo el bloqueo; `remove` bloquea en orden inverso                                                              | Carrera que puede dejar un producto inactivo con stock; posible interbloqueo |
| Alta                                 | **No existe verificación global «saldo = suma de movimientos»** (ni prueba ni script)                                                                           | La documentación lo da por hecho                                             |
| Alta                                 | Sin idempotencia en las creaciones (ajustes, ingresos, conteos, cambios)                                                                                        | Un doble clic o un reintento de red duplica el documento                     |
| Alta                                 | Operaciones por línea (≈ 7 consultas por línea), acotadas solo por un tiempo límite de 30 s                                                                     | Un ingreso grande puede fallar con una base remota                           |
| Alta (antes de producción)           | **Copias externas no implementadas** y nunca probadas; `BACKUPS.md` dice que las fotos «no existen» pero viven en PostgreSQL                                    | La base contiene todo el negocio                                             |
| Alta                                 | Hosting sin definir                                                                                                                                             | Bloquea la puesta en marcha                                                  |
| Media (bloquea el primer despliegue) | **El seed de producción probablemente no se puede ejecutar con la imagen actual** (usa `tsx`, que no está en la imagen) y el CI nunca arranca la imagen         | Deducido leyendo el Dockerfile; **no se comprobó ejecutándolo**              |
| Media                                | Pool de conexiones y tiempos de la base sin configurar; el health check comparte pool                                                                           | Un bloqueo largo puede provocar reinicios                                    |
| Media                                | Rate limit por IP y en memoria; depende de calibrar `TRUST_PROXY_HOPS` en el hosting real                                                                       | Cambio incompatible ya aplicado; debe verificarse al desplegar               |
| Media                                | Sin observabilidad ni alertas                                                                                                                                   | Una caída pasaría desapercibida                                              |
| Media                                | `/cover` sin caché efectiva y fotos sin miniaturas                                                                                                              | N peticiones por pantalla; imágenes de 1200 px mostradas a 50 px             |

## 6. Decisiones que necesitan al dueño del producto

La sección 06 §4 presenta 18 decisiones (OD-01 a OD-18), cada una con alternativas, costos, riesgos y una
recomendación. Las que bloquean otras cosas:

| Decisión                                                                                                         | Recomendación del análisis                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unificar la escritura del libro de inventario y validar variante activa                                          | Hacerlo ya, con pruebas de invariante antes de tocar el código                                                                                        |
| Garantías nuevas en la base (saldo coherente con el libro, ingreso confirmado inmutable, unicidad por documento) | Aprobarlas; para `TRUNCATE`, quitar el permiso al usuario de la aplicación en producción: un trigger rompería las pruebas, que limpian con `TRUNCATE` |
| Idempotencia y reservas                                                                                          | Idempotencia antes de Ventas; reservas solo si hay apartados                                                                                          |
| Reportes e importador dentro del cierre de la Fase 1                                                             | Un mínimo: CSV de inventario y movimientos, e importador si hay más de unas 200 piezas                                                                |
| Gestión de roles                                                                                                 | Construirla antes de Ventas (necesita un rol de Cajero)                                                                                               |
| `CLAUDE.md` está desactualizado                                                                                  | Solo el usuario puede editarlo (ver §7)                                                                                                               |

## 7. Incoherencias (resumen)

La sección 01 documenta **44 incoherencias** (INC-01 a INC-44) con evidencia, impacto y corrección. Las de mayor
efecto:

| Tema                            | Detalle                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLAUDE.md desactualizado**    | Dice «F1-02 en desarrollo»; cita P-03 («costo × 2») como pendiente cuando fue sustituida (ADR-018); cita P-07 como pendiente cuando se implementó (ADR-015); lista ADR solo hasta el 012 (hay 21); dice que las guardas van en `preHandler` y están en `preValidation`; indica `npm run test:e2e`, que falla sin las variables del runner |
| **Regla del ledger vs. código** | CLAUDE.md y ADR-007 dicen «solo el servicio de inventario escribe stock»; el código tiene dos escritores más                                                                                                                                                                                                                              |
| **Revisiones inexistentes**     | Documentos citan `docs/testing/PERFORMANCE.md` y una sección «Revisión ofensiva» de SECURITY.md que no existen                                                                                                                                                                                                                            |
| **Documentos obsoletos**        | `README.md`, `docs/README.md`, `ROADMAP.md`, `ARCHITECTURE.md` («módulos previstos, no implementados») y `BACKUPS.md` describen un estado anterior                                                                                                                                                                                        |
| **Pruebas**                     | `TESTING.md` cita `inventory-counts.spec.ts` (el real es `stock-counts.spec.ts`), dice «9 pantallas» en el E2E responsive (son 16) y «worker thread» (la configuración usa `forks`)                                                                                                                                                       |
| **Alcance**                     | El menú muestra «Ventas» como «Próximamente» aunque CLAUDE.md lo excluye de la fase                                                                                                                                                                                                                                                       |
| **Decisiones sin registrar**    | P-44 a P-47 propuestas por el análisis no están en `PENDIENTES.md`; hay decisiones sin identificador                                                                                                                                                                                                                                      |

**Por regla del proyecto, el agente no edita `CLAUDE.md`:** hacerlo requiere tu aprobación expresa. La sección 01 §6
trae la lista priorizada de 23 correcciones documentales, 7 de las cuales piden una decisión tuya.

## 8. Fase 2 «Ventas» en breve

Detalle completo en la sección 06 §5 y el informe de arquitectura. CLAUDE.md prohíbe hoy el punto de venta: hace
falta **tu autorización explícita** y actualizar ese archivo antes de empezar.

| Etapa  | Contenido                                                                                                                                                                                                     | Jornadas orientativas |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------: |
| E0     | Cerrar la Fase 1 y la deuda técnica Alta/Media (ledger, idempotencia, roles, seed, E2E aislados)                                                                                                              |                   6–9 |
| E1     | Venta de mostrador atómica: descuento inmediato con movimiento `SALE`, identificador por solicitud contra duplicados, foto del precio y costo al vender, lector de códigos, pagos mixtos, comprobante interno |                  8–12 |
| E2     | Anulación controlada con movimiento compensatorio                                                                                                                                                             |                   2–4 |
| E3     | Caja y arqueo                                                                                                                                                                                                 |                   4–6 |
| E4     | Cambios de pieza ligados a la venta                                                                                                                                                                           |                   4–6 |
| E5     | Reportes de ventas                                                                                                                                                                                            |                   4–6 |
| E6     | Clientes, descuentos o apartados (según respuestas)                                                                                                                                                           |               3–5 c/u |
| Fase 3 | Facturación electrónica con el SIN, aislada, tras consultar al contador                                                                                                                                       |                aparte |

Núcleo E0 a E5: **31 a 48 jornadas** (estimación orientativa, sin fechas). Cinco respuestas del cliente bloquean el
diseño: mínimo para vender, facturación, tratamiento del impuesto sobre el precio «neto», medios de pago y moneda,
ventas a crédito o apartados. Hay 17 preguntas Q-V01 a Q-V17 en la sección 06.

## 9. Método y límites de este informe

- **Lectura estática.** Las secciones se produjeron leyendo código y documentos. No se ejecutó la aplicación en
  producción ni se midió rendimiento bajo carga; las cifras de rendimiento son análisis de código o mediciones de
  compilación.
- **Lo que sí se ejecutó:** `check` completo y los 59 E2E en un entorno efímero antes de integrar (la salida se
  cita en las secciones 05 y 06), y la compilación para medir el tamaño de la web.
- **No verificado** (consta en cada sección): resultado actual de `npm audit` (sin red), versiones resueltas del
  lockfile, ejecución real de la imagen Docker y de las migraciones en el hosting, estado de la protección de ramas
  en GitHub y si existe un `render.yaml`.
- **Defecto conocido de este informe:** la sección 01 cita «INC-46» en la cronología (§1, equivalencia entre las dos
  numeraciones de fases) sin definirlo en su tabla de incoherencias, que llega hasta INC-44 (INC-45 e INC-46 no
  figuran). La incoherencia existe, pero falta su fila.
- **Puntos marcados †** en la sección 06 conservan el estado de una auditoría anterior sin releer el código.
- Los informes de auditoría previos (base de datos, backend, seguridad, frontend) y la tanda de correcciones
  aplicada están resumidos en la sección 06 §1.4 y en `CHANGELOG.md`.

## 10. Sugerencia de lectura

1. Este resumen (10 minutos).
2. Sección 06 §3 y §4 (deuda y decisiones): lo que requiere acción tuya.
3. Sección 01 §4 (incoherencias) y §6 (correcciones documentales).
4. Secciones 02 a 05 como referencia técnica, según el área.

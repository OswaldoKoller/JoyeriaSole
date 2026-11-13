# Plan de desarrollo de la Fase 1 — tras la reunión del 2026-11-05

**Estado: plan aprobado e implementado en gran parte** (ver la sección 12, «Estado de implementación
(2026-11-05)»). El texto de las secciones 1 a 11 conserva la propuesta original; donde difiere, prevalece
la sección 12 y las decisiones de [DECISIONES-ABIERTAS-2026-11-05.md](../business/DECISIONES-ABIERTAS-2026-11-05.md)
ya respondidas.
**Regla de autorización compartida (cliente, 2026-11-05, posterior):** el Administrador **y** el Responsable
de inventario pueden autorizar ajustes, precios, stock inicial y conteos; donde este plan dice que solo el
Administrador aprueba (D4, Q-01 B, S6/S7/S8), prevalece esa regla (ver la sección 7 de
[RESOLUCIONES-2026-11-05.md](../business/RESOLUCIONES-2026-11-05.md)).
Reglas del cliente: [RESOLUCIONES-2026-11-05.md](../business/RESOLUCIONES-2026-11-05.md). No se asignan
fechas (consistente con [ROADMAP.md](ROADMAP.md)); el tamaño es relativo: **S** pequeña, **M** mediana,
**L** grande.

## 1. Punto de partida (verificado el 2026-11-05)

| Elemento                                       | Estado                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `develop`                                      | Contiene hasta el catálogo/inventario inicial. **Los PR #1–#4 siguen abiertos y apilados** (#4 incluye a #3, #2 y #1; el CI de #4 estaba verde).                                                                                                                                                                                             |
| Funciona y se conserva                         | Usuarios y roles, proveedores, catálogo base con SKU automático, libro de movimientos y saldos, auditoría, ingresos con costeo exacto (ADR-015), panel, dashboard, diseño responsive, despliegue local y datos de demostración.                                                                                                              |
| Trabajo de Codex (sin publicar)                | Rama `backup/wip-2026-10-11`, 61 archivos: su propia versión de **ingresos**, **precios** (multiplicador por categoría, propuestas con aprobación) y **conteos** (ciclo de estados, cursor de movimientos), 3 migraciones, pruebas y E2E. **No auditado**: hay dos implementaciones de ingresos en conflicto y reglas que la reunión cambió. |
| Ramas locales sin publicar                     | `docs/analisis-fases-pendientes` (esta documentación) y `feat/despliegue-local`.                                                                                                                                                                                                                                                             |
| Auditoría de seguridad / pentest / rendimiento | **Nunca se ejecutaron** (los agentes se detuvieron sin resultado). Siguen pendientes.                                                                                                                                                                                                                                                        |
| Pruebas                                        | No se ejecutó la suite completa hoy; la última verificación conocida es la del CI de #4.                                                                                                                                                                                                                                                     |

## 2. Cómo trabajamos de aquí en adelante

La versión actual funcionó, pero el trabajo en paralelo dejó ramas apiladas y una segunda implementación
sin integrar. Para evitarlo:

1. **Contrato antes de código.** Cada rebanada empieza con una ficha de una página (resultado visible,
   decisiones P-xx/Q-xx, datos, API, permisos, pantallas, pruebas, criterio de aceptación) que el
   usuario aprueba. Si el contrato descubre una regla no definida, se agrega a las decisiones abiertas.
2. **Rebanada vertical y corta.** Una rama, un PR, un comportamiento verificable (migración + API +
   pantalla + pruebas + documentos).
3. **Integrar pronto, nunca apilar.** Cada rebanada nace de `develop`, pasa `npm run check` y se
   fusiona antes de empezar la siguiente.
4. **Una sola migración abierta a la vez.** Evita conflictos de esquema y de orden de migraciones.
5. **Un directorio por herramienta.** Claude, Codex u otro trabajan en su propio worktree y rama; nada
   queda sin commit en el directorio principal.
6. **Dinero y stock con pruebas de invariantes.** Decimal/BigInt, nunca `float`; pruebas de que los
   repartos suman el total y de que movimiento, saldo y auditoría se escriben juntos.
7. **Demo en cada cierre.** Datos de demostración actualizados y `npm run local:up -- --demo` para
   enseñar la rebanada al cliente con un guion corto.
8. **Revisión de seguridad por rebanada** (permisos 401/403, datos expuestos, transacciones) con el
   agente de seguridad; la auditoría completa va en S12.
9. **Definición de terminado** de `CLAUDE.md`: `npm run check` verde, pruebas nuevas, documentación/ADR,
   sin decisiones pendientes implementadas por suposición, CHANGELOG.

## 3. Mapa de impacto sobre lo construido

| Área                 | Hoy                                                        | Cambio por la reunión                                                                                          | Rebanada | Costo      |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| Sesiones             | 3 h fijas (ADR-003)                                        | 8 h (según Q-02)                                                                                               | S1       | Bajo       |
| Permisos y roles     | `inventory:adjust` único; aprobar conteos para Responsable | Separar solicitar/aprobar ajustes; matriz F3 resuelta (Q-01, Q-15)                                             | S1       | Bajo       |
| Saldos               | Sin restricción en BD                                      | `CHECK (quantity >= 0)` (P-08)                                                                                 | S1       | Bajo       |
| Desactivar con stock | Sin regla                                                  | Bloquear si stock > 0 (P-22); eliminación física solo Admin, solo sin movimientos (B11)                        | S1/S2    | Bajo       |
| Catálogo             | Atributos de lista, SKU, código propio/proveedor           | Valores y clasificación variante/descriptivo, etiqueta Code 128, ficha incompleta, regla de códigos            | S2       | Medio      |
| Archivos             | API solo JSON                                              | Fotos de producto: tabla, interfaz de almacenamiento, subida con validación                                    | S3       | Medio      |
| Proveedores          | Nombre, NIT, contacto, teléfono, correo, dirección         | País, tipo, moneda habitual, WhatsApp, condiciones de pago                                                     | S4       | Bajo       |
| Ingresos             | Bs, 3 costos fijos, ítems de variantes existentes          | USD + tipo de cambio, lista de costos (aduana, comisiones…), alta rápida de pieza nueva, discrepancias, fechas | S5       | **Alto**   |
| Ajustes              | Solo ajuste inicial; ajustes manuales sin construir        | Documento con solicitud → aprobación, catálogo de motivos, bandeja de pendientes                               | S6       | Medio      |
| Precios              | `sale_price` en variante, sin historial ni regla           | Multiplicador y redondeo por producto, flujo de aprobación, historial, ganancia visible, precio neto           | S7       | Medio-Alto |
| Conteos              | Solo tabla base                                            | Por categoría, a ciegas, captura persistente, hallazgos, segundo recuento, conciliación (ADR-014)              | S8       | **Alto**   |
| Movimientos          | `CUSTOMER_RETURN` reservado                                | `EXCHANGE_IN` / `EXCHANGE_OUT` y operación atómica de doble movimiento                                         | S9       | Bajo       |
| Auditoría / reportes | Se registra, sin pantalla                                  | Pantalla, reportes y exportaciones (sujeto a respuestas G)                                                     | S10      | Medio      |
| Carga de datos       | Sin estrategia                                             | Importador con vista previa (sujeto a respuestas H)                                                            | S11      | Medio      |

## 4. Rebanadas

El orden sigue el flujo real del cliente (A1): catálogo → ingreso → costos → ajustes → precio → conteo →
disposición para venta.

### S0 · Puesta en orden (sin funcionalidad nueva) — S

- Integrar PR #1 → #4 en `develop` en orden y comprobar `npm run check` y E2E sobre `develop` (G-01).
- Archivar el trabajo de Codex en una rama de referencia y revisarlo por partes en cada rebanada (G-02).
- Fusionar `docs/analisis-fases-pendientes` y `feat/despliegue-local` (solo cuando el usuario lo pida).
- Corregir las inconsistencias de documentación (ver [F1-ANALISIS-FASES-2026-10-13.md](F1-ANALISIS-FASES-2026-10-13.md);
  `CLAUDE.md` aún cita P-03 y P-07 como pendientes y 3 h de sesión) y actualizar [PENDIENTES.md](../business/PENDIENTES.md)
  con los estados de las resoluciones del 2026-11-05.
- **Requiere:** G-01 y G-02. **Salida:** `develop` verde, sin trabajo huérfano, registro de decisiones al día.

### S1 · Reglas base transversales — S

- Sesión de 8 h (Q-02); actualizar ADR-003, pruebas y documentación.
- `CHECK (quantity >= 0)` en `inventory_balances` mediante migración con SQL (P-08).
- Bloqueo de desactivación con stock > 0 en producto y variante (P-22).
- Permisos: separar `inventory:adjust` (solicitar) de `inventory:adjust-approve`; ajustar seed y roles por
  Q-01/Q-15; pruebas de la matriz completa por rol.
- Restablecer contraseña por el Administrador con clave temporal y cambio obligatorio (F2): verificar si
  ya existe en F1-02 y completar lo que falte.
- **Requiere:** Q-01, Q-02, Q-15. **Pruebas:** 401/403 por permiso, saldo negativo rechazado a nivel BD,
  sesión vence a las 8 h.

### S2 · Catálogo completo — M

- Clasificación de los 12 atributos (variante/descriptivo) y gestión de valores por el cliente (P-15).
- Ficha de producto con nombre sugerido (B4), ejes → variantes con SKU correlativo, categorías de dos
  niveles con permisos B1.
- Código de barras: se conserva el del proveedor si existe, o se genera el propio; manejo de código
  repetido (Q-10b); búsqueda por SKU o código.
- Etiqueta Code 128 con el SKU, impresión desde el navegador con tamaño configurable (Q-10c).
- Marca «Ficha incompleta» y contador en el inicio (C1).
- Eliminación física de fichas sin movimientos, solo Administrador (B11).
- Revisar y reutilizar lo útil del catálogo de Codex (atributos y formularios) con pruebas.
- **Requiere:** Q-03, Q-10 y las listas de categorías/valores del cliente (no bloquea el código).
- **Pruebas:** E2E de crear producto con variantes por rol; unicidad de SKU/código; permisos.

### S3 · Fotos de producto — M

- Interfaz de almacenamiento con implementación de disco (desarrollo/pruebas) y la elegida en Q-09.
- Tabla `product_images` (producto, orden, principal, tipo, tamaño); subida con validación de tipo real
  (firma del archivo, no solo extensión), límite de tamaño y reducción de tamaño en el servidor.
- Galería en la ficha del producto; foto principal en listados.
- **Dependencias nuevas a justificar** (regla de `CLAUDE.md`): soporte de subida multiparte y librería de
  procesamiento de imágenes; se evalúan antes de agregarlas. Ajuste de la política CSP para imágenes.
- **Requiere:** Q-09. **Pruebas:** tipo/tamaño inválido, permiso, archivo malicioso renombrado, borrado.

### S4 · Proveedores v2 — S

- Campos propuestos en C8 (país, tipo, moneda habitual, WhatsApp, condiciones de pago); migración,
  API, pantalla y pruebas. Compatible con proveedores ya creados.
- **Requiere:** nada abierto. Puede ir junto a S3 (ramas distintas, migraciones en serie).

### S5 · Ingresos de mercadería v2 (importación) — L

- Moneda de compra por ingreso y tipo de cambio (Q-07); precios por pieza en USD con equivalente en Bs.
- Lista de costos del ingreso (aduanización, comisiones, transporte, embolsado, otros) con tipo y monto
  (Q-08); migración de los tres costos actuales a la nueva lista sin perder historia.
- Prorrateo por valor de compra con reparto exacto de centavos (ADR-015) sobre el valor ya convertido a Bs;
  costo total visible antes de confirmar; último costo en la variante.
- Alta rápida de piezas nuevas dentro del ingreso con datos mínimos y foto (C1/P-24).
- Diferencias esperado vs recibido con justificación obligatoria (C2); fecha del documento hasta 30 días
  atrás (C6); entregas parciales con el mismo comprobante (C5); la confirmación sigue siendo de una vez
  y por quien registra (C3); correcciones solo por ajuste (C4).
- Historial de costos en la ficha del producto (C10).
- Documentos: **ADR-016** (compras en dólares y costos de importación; amplía ADR-008/013/015).
- **Requiere:** S2, S4, Q-07, Q-08. **Pruebas:** reparto suma exacto con tipo de cambio; confirmar una
  sola vez; movimiento/saldo/auditoría atómicos; concurrencia; E2E del flujo completo por rol.

### S6 · Ajustes manuales — M

- Documento de ajuste: solicitud → aprobación → movimiento (Q-01); motivos predefinidos más texto libre
  (E1); «salida a cero» para descontinuar (B11); no permite saldo negativo.
- Bandeja de pendientes de aprobación (Q-14); trazabilidad completa (quién, cuándo, variante, cantidad
  anterior/nueva, diferencia, motivo, observación).
- Documento: **ADR-017** (ajustes con aprobación; amplía ADR-009).
- **Requiere:** S1, Q-01, Q-14. **Pruebas:** solicitud sin permiso, aprobación por rol, atomicidad,
  auditoría, rechazo.

### S7 · Precios — M/L

- Sugerencia **visual** al ver el costo (D3): costo total × multiplicador con la regla de redondeo (Q-04,
  Q-05); nunca cambia el precio sola.
- Cambios de precio: el Responsable solicita, el Administrador aprueba (uno o en masa) o cambia
  directamente (D4); vigencia inmediata; historial en entidad propia (D5).
- Ganancia en Bs y % sobre costo para quien tiene permiso de costos; el vendedor solo ve el precio (D8,
  Q-06). Precio neto (D7); precio 0 permitido pero no vendible (D9).
- Reutilizar el modelo de propuestas de Codex tras revisarlo.
- Documento: **ADR-018** (reglas de precio, redondeo y aprobación; sustituye el multiplicador por
  categoría de P-03).
- **Requiere:** S5, Q-04, Q-05, Q-06. **Pruebas:** redondeo (casos 204/206/114,7), permisos de aprobación,
  historial inmutable, vendedor sin costos en ninguna respuesta de la API.

### S8 · Conteo físico — L

- Conteo por categoría/subcategoría; varios a la vez según Q-13 con validación de no solapamiento.
- Captura **a ciegas** con lector (texto + Enter), un operador, guardado pieza por pieza que sobrevive a
  cierres de sesión; piezas no registradas como «hallazgo».
- Segundo recuento obligatorio de las variantes con diferencia antes de aprobar (E6); aprueba quien
  defina Q-01.
- Conciliación con los movimientos ocurridos desde el inicio del conteo (ADR-014, P-13); ajustes
  generados en la misma transacción de la aprobación; numeración correlativa (P-11).
- Reutilizar el cursor de movimientos y el ciclo de estados de Codex tras revisarlos.
- **Requiere:** S6, Q-01, Q-13, Q-15. **Pruebas:** movimientos concurrentes durante el conteo, reanudar
  tras sesión vencida, aprobación sin segundo recuento rechazada, atomicidad.

### S9 · Cambios y disposición para venta — S/M

- Tipos de movimiento `EXCHANGE_IN`/`EXCHANGE_OUT` y operación interna atómica de doble movimiento con
  referencia común; ADR-019 (cambios y relación con el futuro módulo de ventas) (Q-12).
- Estado de disposición para venta solo si el cliente elige B o C en Q-11.
- **Requiere:** Q-11, Q-12. **Pruebas:** un cambio nunca deja saldo negativo ni descuadra un conteo.

### S10 · Control, reportes y auditoría — M

- Pantalla de auditoría con filtros, reportes y exportaciones CSV/Excel según lo que el cliente marque
  en G1–G6; el dashboard actual ya cubre alertas básicas.
- **Requiere:** respuestas G1–G6 (sin responder). No bloquea S1–S9.

### S11 · Carga inicial de datos — M

- Importador de Excel/CSV con vista previa, validación fila por fila e informe de errores; plantillas
  descargables para categorías, productos y stock inicial; todo vía los mismos servicios (movimiento de
  stock inicial, auditoría).
- **Requiere:** respuestas H1–H3 y el archivo real del cliente (sin responder). Se puede preparar la
  herramienta con datos ficticios.

### S12 · Endurecimiento previo a producción — M

- Revisión estática de seguridad y prueba de ataque en entorno aislado (nunca contra la base de
  desarrollo ni datos reales); corrección de hallazgos.
- Mover la autorización a `preValidation` en los ~39 endpoints que hoy validan el cuerpo antes de
  autorizar (cambio aún no aprobado por el usuario).
- Pruebas de rendimiento con el volumen del cliente (hasta ~2.000 piezas, 3–5 usuarios): se espera que
  no requiera optimización; solo se verifica.
- Rotación de `AUTH_SECRET`, copias de seguridad y prueba de restauración, avisos de caída.
- **Requiere:** S1–S8 terminadas y respuestas I1–I8.

> **Actualización 2026-11-09.** Por decisión del responsable (E4 de
> [RESOLUCIONES-2026-11-09](../business/RESOLUCIONES-2026-11-09.md)), la revisión de seguridad y
> rendimiento archivada es el [informe técnico](../informe-tecnico/). Contiene análisis estático del
> código y de la documentación, mediciones de tamaño de _bundle_ obtenidas compilando (`vite build`) y
> cifras de pruebas y tiempos tomadas del CI. **No contiene** la prueba de ataque en entorno aislado ni
> pruebas de rendimiento con el volumen del cliente: ambas **siguen pendientes**. No existen la sección
> «Revisión ofensiva» de `SECURITY.md` ni `docs/testing/PERFORMANCE.md`.

### S13 · Aceptación y puesta en marcha — M

- Guion de demostración y acta por módulo, manual de usuario, capacitación, hosting y dominio (I),
  periodo en paralelo (H5), cierre de Fase 1.
- **Requiere:** respuestas H, I, J, K y usuarios reales (F1).

## 5. Dependencias y orden

```
S0 ─ S1 ─ S2 ─┬─ S3 (fotos)
              ├─ S4 (proveedores) ─┐
              └────────────────────┴─ S5 (ingresos v2) ─ S7 (precios) ┐
                S1 ─ S6 (ajustes) ───────────────────────────────────┴─ S8 (conteo) ─ S9 ─ S12 ─ S13
                                 S10 y S11 en cuanto el cliente responda G/H
```

- Las migraciones se aplican de a una: S3 y S4 pueden desarrollarse a la vez en ramas distintas, pero
  su migración se fusiona en serie.
- S6 no depende de S5: puede adelantarse si el cliente necesita ajustar stock antes de las compras en
  dólares.
- Lo que el cliente aún no entregó (categorías, valores de atributos, inventario actual, impresora)
  **no bloquea el código**; bloquea la carga real y la puesta en marcha.

## 6. Permisos resultantes (provisional, según las opciones recomendadas)

| Acción                                   | Administrador | Responsable de inventario |   Vendedor   |
| ---------------------------------------- | :-----------: | :-----------------------: | :----------: |
| Ver catálogo, fotos y stock              |       ✔       |             ✔             |      ✔       |
| Crear/editar catálogo, categorías, fotos |       ✔       |             ✔             |      —       |
| Ver costos y ganancia                    |       ✔       |             ✔             |      —       |
| Solicitar cambio de precio               |       ✔       |             ✔             |      —       |
| Aprobar / cambiar precio directamente    |       ✔       |             —             |      —       |
| Proveedores                              |       ✔       |             ✔             |      —       |
| Crear y confirmar ingresos               |       ✔       |             ✔             |      —       |
| Solicitar ajuste                         |       ✔       |             ✔             |      —       |
| Aprobar ajuste                           |       ✔       |        — (Q-01 B)         |      —       |
| Capturar conteo                          |       ✔       |             ✔             |      —       |
| Aprobar conteo                           |       ✔       |             ✔             |      —       |
| Ver inicio/tablero                       |       ✔       |             ✔             | ✔ sin costos |
| Auditoría                                |       ✔       |             —             |      —       |
| Usuarios y roles                         |       ✔       |             —             |      —       |

## 7. Documentos y ADR por escribir

| ADR        | Tema                                                              | Se redacta en |
| ---------- | ----------------------------------------------------------------- | ------------- |
| ADR-016    | Compras en dólares y costos de importación                        | S5            |
| ADR-017    | Ajustes con solicitud y aprobación                                | S6            |
| ADR-018    | Reglas de precio, redondeo, aprobación e historial                | S7            |
| ADR-019    | Cambios de mercadería y futura relación con ventas                | S9            |
| ADR-020    | Almacenamiento de archivos y fotos                                | S3            |
| (enmienda) | ADR-003 sesión de 8 h; ADR-009 conteo a ciegas y segundo recuento | S1 / S8       |

Además: `DATABASE.md`, `API.md`, `DOMINIO.md`, `PENDIENTES.md` y `CHANGELOG.md` se actualizan en cada
rebanada, no al final.

## 8. Riesgos

| Riesgo                                                                           | Mitigación                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cambiar ingresos (S5) rompe el costeo exacto ya verificado                       | Pruebas de invariantes antes y después; migración de costos con reversión probada; ADR previo.                     |
| Dos implementaciones de ingresos/precios/conteos (PR #4 y Codex)                 | G-02: referencia, no fusión; cada rebanada decide qué reutiliza.                                                   |
| Decisiones contradictorias reaparecen en pleno desarrollo (P-01, P-17, redondeo) | Cerrarlas en las Q-xx antes de la rebanada que las usa; contrato aprobado.                                         |
| Fotos aumentan costo y superficie de ataque (archivos subidos)                   | Validación por firma, límites, reducción en servidor, almacenamiento tras una interfaz.                            |
| Código de barras del proveedor repetido entre proveedores                        | Q-10b; aviso y uso del SKU como identificador único.                                                               |
| Compras en dólares con tipo de cambio mal digitado                               | Vista previa del costo total antes de confirmar; el tipo de cambio queda en auditoría; sin edición tras confirmar. |
| Producción sin hosting, copias ni usuarios definidos                             | Bloques F, I, K del cuestionario con responsable y fecha en el acta; S12–S13 no arrancan sin ellos.                |
| Seguridad y rendimiento nunca auditados                                          | S12 obligatoria antes de producción; revisión por rebanada mientras tanto.                                         |

## 9. Fuera de alcance (se mantiene)

Punto de venta, facturación e Impuestos Nacionales, contabilidad, multisucursal, app móvil, IA, compras
automáticas, integraciones bancarias, QR, modo sin conexión, listas de precios, consignación,
devoluciones a proveedor y control por lotes. Los cambios de clientes (C9) solo se **preparan** (S9).

## 10. Lo que se necesita para empezar

1. Respuestas (o «usar recomendadas») a las Q-01…Q-15 que bloquean la primera rebanada: **Q-01, Q-02,
   Q-15** para S1 y **Q-03, Q-10** para S2.
2. Decisión sobre G-01 (fusionar los PR) y G-02 (qué hacer con el trabajo de Codex).
3. Aprobación de este plan o de sus cambios. Al aprobarse S0 se ejecuta primero: no se escribe código de
   negocio antes de dejar `develop` limpio.

## 11. Actualización tras las respuestas (2026-11-05)

Las respuestas a las Q-xx están en la sección 7 de
[RESOLUCIONES-2026-11-05.md](../business/RESOLUCIONES-2026-11-05.md) y **prevalecen sobre este plan**
donde difieren. Cambios:

- **S7 se simplifica.** No hay multiplicador, redondeo ni sugerencia de precio (Q-04/Q-05). Queda: precio
  de venta manual por variante, panel de costos (precio de compra, subtotal, costos adicionales, costo
  total), ganancia en Bs y % sobre costo (Q-06), solicitud/aprobación/cambio directo, historial y precio
  neto. **ADR-018** trata solo de aprobación e historial de precios.
- **S2:** sin campo de número de serie (Q-03); etiqueta con SKU para todas las piezas (Q-10).
- **S3:** fotos dentro de PostgreSQL tras una interfaz de almacenamiento (Q-09 C).
- **S5:** solo dólares (Q-07); costos por monto (Q-08).
- **S6/S8:** ajustes solo los aprueba el Administrador y solo afectan el stock al aprobarse; conteos los
  aprueba Responsable o Administrador (Q-01).
- **S9:** solo la base de cambios, sin pantallas (Q-12).
- **Ejecución:** se trabaja en tres pistas paralelas con ramas propias que parten de `feature/f1-base`
  (punta del PR #4 más la documentación y el despliegue local); se integran y verifican juntas.

## 12. Estado de implementación (2026-11-05)

Resumen de lo construido al integrar las tres pistas en la rama `feature/f1-integracion`. Fuentes: el
historial de esa rama, los módulos de `apps/api/src/modules` y las pantallas de `apps/web/src/features`.
Nada se fusionó en `develop` remoto (G-01 sigue sin ejecutar: los PR #1–#4 continúan abiertos).

Pistas: **T1** `feature/f1-catalogo` · **T2** `feature/f1-ingresos-precios` · **T3** `feature/f1-inventario` ·
**Integración** `feature/f1-integracion` (fusiona las tres y agrega lo transversal).

| Rebanada | Estado       | Rama / pista     | Qué existe y qué falta                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0       | Parcial      | Integración      | Documentación puesta en orden (PENDIENTES, CHANGELOG, API, base de datos, ADR) y ramas integradas. Falta fusionar los PR #1–#4 en `develop` y publicar las ramas de documentación y despliegue local (solo cuando el usuario lo pida).                                                                                                                                                                                                               |
| S1       | Hecha        | T1               | Sesión fija de 8 h, `CHECK (quantity >= 0)`, bloqueo de desactivación con stock, clave temporal con cambio obligatorio, matriz de permisos probada. En la integración el stock inicial pasó a `inventory:initial-stock` (Administrador y Responsable).                                                                                                                                                                                               |
| S2       | Hecha        | T1               | Atributos y valores, categorías de dos niveles, ficha completa, códigos y búsqueda unificada, etiquetas Code 128, ficha incompleta y «Sin precio», eliminación física solo Administrador. Pantallas de Productos, Categorías, Atributos y Etiquetas. Faltan las listas de valores que entrega el cliente.                                                                                                                                            |
| S3       | Hecha        | T1 e Integración | Fotos de producto en PostgreSQL (`PhotoStorage`, ADR-020): subida, portada, orden, borrado, galería y miniaturas. `PhotoUploader` conectado al alta rápida de pieza del ingreso. **La foto de la pieza aparece en todas las pantallas** (pedido del cliente) vía `GET /products/variants/:variantId/cover`. Productos se muestra en tarjetas simples (foto, nombre, precio, disponibilidad y stock) que abren la página de detalle `/productos/:id`. |
| S4       | Hecha        | T2               | Proveedores v2 (tipo, país, WhatsApp, moneda habitual, condiciones de pago).                                                                                                                                                                                                                                                                                                                                                                         |
| S5       | Hecha        | T2               | Ingresos v2: USD con tipo de cambio, lista abierta de costos con tipos (`settings:manage`), prorrateo exacto, panel de costos, alta rápida de pieza (sin foto todavía), discrepancias, fechas, entregas parciales e historial de costos (ADR-016).                                                                                                                                                                                                   |
| S6       | Hecha        | T3 e Integración | Ajustes con solicitud y aprobación (ADR-017), motivos, pantallas `/inventario/ajustes`. La bandeja «Pendientes de aprobación» del Inicio (Q-14) se agregó en la integración (`GET /approvals/pending`).                                                                                                                                                                                                                                              |
| S7       | Hecha        | T2               | Precios manuales con solicitud, aprobación en masa o cambio directo, historial inmutable y ganancia en vivo (ADR-018). Sin multiplicador ni redondeo (Q-04/Q-05).                                                                                                                                                                                                                                                                                    |
| S8       | Hecha        | T3               | Conteo físico a ciegas por categoría, segundo recuento, hallazgos, conciliación y aprobación atómica (ADR-021). Pantallas `/inventario/conteos`. Quedan abiertas P-C1 a P-C3.                                                                                                                                                                                                                                                                        |
| S9       | Hecha (base) | T3               | Movimientos `EXCHANGE_IN`/`EXCHANGE_OUT` y operación atómica de cambio de pieza, sin pantallas por decisión del cliente (ADR-019). Sin estado «en preparación» (Q-11 A). Queda P-30 (quién registra cambios en ventas).                                                                                                                                                                                                                              |
| S10      | Parcial      | Integración      | **Pantalla de Auditoría solo para el Administrador hecha** (`/auditoria`, `GET /audit`, filtros, detalle antes/después con redacción de secretos). Faltan reportes y exportaciones (esperan respuestas G1–G6; también CSV de auditoría P-AUD-1). Existen el dashboard de alertas y el historial global de movimientos.                                                                                                                               |
| S11      | Pendiente    | —                | No hay importador. Espera respuestas H1–H3 y el archivo real del cliente.                                                                                                                                                                                                                                                                                                                                                                            |
| S12      | Hecha (base) | Integración      | Revisión de seguridad estática hecha (sin críticos ni altos); autorización en `preValidation` en todos los módulos; fotos con límites de píxeles y concurrencia; listado de inventario paginado en la base (60–220 ms con 2.000 piezas). Abiertos: B5 (escrituras de saldo fuera de `modules/inventory`), B7 (límite de intentos por IP; confirmar `TRUST_PROXY` en producción), `npm audit`, rotación de secretos.                                  |
| S13      | Pendiente    | —                | Despliegue y demostración: hosting y dominio sin definir (P-18), usuarios reales sin definir (F1), manual, capacitación y acta de aceptación.                                                                                                                                                                                                                                                                                                        |

### Pendiente conocido al cierre

1. **Reportes y exportaciones** (S10) y **importación de datos** (S11): esperan las respuestas G1–G6 y H1–H3.
2. **Seguridad residual** (S12): B5, B7, `npm audit` y rotación de secretos.
   - Actualización 2026-11-09: la «revisión de seguridad estática» y las cifras de 60–220 ms de la
     tabla no tienen informe propio; la revisión archivada es el [informe técnico](../informe-tecnico/)
     (E4), que no incluye pruebas ofensivas ejecutadas ni mediciones de carga (siguen pendientes).
3. **Listas de valores de atributos** que entrega el cliente.
4. **Despliegue y demostración** (S13): `npm run local:up -- --demo` sirve para enseñar la Fase 1; el hosting
   real depende de las respuestas del bloque I.
5. Decisiones del cliente por confirmar: ver [PENDIENTES.md](../business/PENDIENTES.md) (en particular P-43,
   riesgo aceptado de auto-aprobación; P-41, ficha incompleta; P-42, bandeja de pendientes; P-C1 a P-C3,
   conteos; P-30, cambios de pieza). P-40 (stock inicial) quedó resuelta por la regla de autorización
   compartida.

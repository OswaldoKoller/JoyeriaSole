# Resolución formal Q-V07, Q-V09 y Q-V12 — 2026-11-07

> **Procedencia.** Texto entregado por el responsable del proyecto el **2026-11-07** y registrado aquí
> el 2026-11-09 por su autorización expresa (respuesta A2 de
> [RESOLUCIONES-2026-11-09](RESOLUCIONES-2026-11-09.md)). **Tipo de autorización: solo análisis y
> planificación.** Esta resolución no autoriza modificar código, ejecutar migraciones ni desplegar.
>
> El texto de abajo se conserva **íntegro y sin cambios de fondo**: solo se añadieron saltos de línea y
> separaciones entre párrafos y listas para el formato Markdown. Las subdecisiones que esta resolución
> dejó pendientes y que ya recibieron respuesta se registran en
> [RESOLUCIONES-2026-11-09](RESOLUCIONES-2026-11-09.md); **este documento no se actualiza con ellas**.
> El estado vigente de cada decisión está en [PENDIENTES.md](PENDIENTES.md) (bloque «Ventas (Fase 2)»).

**JOYERÍA SOLE — Resolución formal de decisiones Q-V07, Q-V09 y Q-V12**

(Texto íntegro entregado por el responsable del proyecto el 07/11/2026. Fase 2 — Ventas. Estado: resolución comercial confirmada, con subdecisiones pendientes. Tipo de autorización: ANÁLISIS Y PLANIFICACIÓN ÚNICAMENTE.)

## 1. Antecedentes

Decisiones confirmadas previamente por el responsable:

- Q-V01: Venta de mostrador con comprobante interno.
- Q-V02: La facturación fiscal se realizará mediante un sistema externo.
- Q-V03: El precio registrado representa el total cobrado; la aplicación no añade impuestos.
- Q-V04: Pagos en efectivo, QR, transferencia y combinaciones de estos, exclusivamente en bolivianos.
- Q-V05: Solo ventas pagadas íntegramente al momento. Se excluyen créditos y apartados.

Se incorporan ahora Q-V07, Q-V09 y Q-V12. Ninguna de estas resoluciones constituye autorización para modificar código, ejecutar migraciones o desplegar funcionalidades.

## 2. DEC-V07 — Prohibición de anulación de ventas (Q-V07) — CONFIRMADA

Regla: No se permitirán anulaciones de ventas confirmadas mediante el flujo ordinario de la aplicación. Una venta confirmada deberá permanecer registrada y conservar su trazabilidad.

Consecuencias técnicas para el alcance inicial:

- No implementar `POST /sales/:id/void`.
- No incorporar el permiso `sales:void`.
- No implementar el movimiento `SALE_VOID`.
- No habilitar botones de anulación.
- No permitir eliminación física de ventas confirmadas.
- No habilitar modificación de los importes o productos de una venta confirmada.
- No incluir el estado `VOIDED` como parte del flujo autorizado del MVP.
- Mantener auditoría e historial de cada venta.

Prevención de errores (controles previos a la confirmación): 1) mostrar productos, cantidades y precios definitivos; 2) validar disponibilidad de inventario; 3) confirmar la suma de pagos; 4) evitar envíos duplicados mediante idempotencia; 5) garantizar una transacción atómica; 6) permitir corregir el carrito antes de confirmar.

Excepciones todavía no definidas: la prohibición no determina cómo resolver una venta errónea ya confirmada, pagos incorrectos, duplicaciones históricas, devoluciones obligatorias ni cambios de piezas. Estos casos deberán documentarse como incidencias o procesos especiales y presentarse al responsable para aprobación. No implementar mecanismos alternativos de reversión sin autorización expresa.

Advertencia: revisar las obligaciones legales aplicables y no asumir que una política comercial excluye cualquier devolución o rectificación exigida por ley.

Relación con ADR: el ADR-025, propuesto para anulaciones, debe clasificarse como no aprobado o sustituido por esta decisión, según su estado real en el repositorio. No eliminar documentación histórica sin establecer su trazabilidad.

## 3. DEC-V09 — Caja única con apertura, cierre y arqueo (Q-V09) — CONFIRMADA EN SU ALCANCE PRINCIPAL

Regla: una única caja lógica, compartida por los usuarios autorizados, con apertura, registro de cobros, cierre y arqueo.

Modelo técnico propuesto:

- Entidad `cash_sessions`, campos mínimos: identificador único; número de sesión; estado `OPEN`/`CLOSED`; usuario de apertura; fecha y hora de apertura; fondo inicial; usuario de cierre; fecha y hora de cierre; efectivo esperado; efectivo contado; diferencia; observaciones.
- Entidad `cash_movements` (movimientos manuales distintos de ventas, cuando se autoricen): sesión de caja; tipo de movimiento; importe; motivo; usuario responsable; fecha y hora. Deben conservar historial y auditoría.
- Relación con `sale_payments`: las ventas deben asociarse con la sesión de caja correspondiente. El sistema debe separar cobros en efectivo, QR, transferencias y ventas con pagos mixtos. El efectivo esperado se calcula a partir del fondo inicial, los cobros aplicados en efectivo y los movimientos de caja autorizados. Los cobros QR y transferencias se reportan separadamente y no forman parte del efectivo físico a contar.

Restricciones propuestas: garantizar en la base de datos una sola sesión abierta; impedir cierres duplicados mediante operaciones idempotentes; mantener los datos del cierre como información histórica; registrar las diferencias de arqueo; evitar modificar directamente el importe esperado.

Subdecisiones PENDIENTES (solicitar aprobación específica; no darlas por confirmadas por haber elegido caja única): 1) roles que pueden abrir y cerrar caja; 2) venta sin sesión abierta; 3) fondo inicial y sus restricciones; 4) tolerancia de diferencia; 5) registro de gastos y retiros; 6) reapertura de caja cerrada; 7) manejo de cierre con QR o transferencia pendiente de conciliación; 8) responsabilidad de cada vendedor dentro de una caja compartida.

Relación con ADR: preparar propuesta ADR-028 para caja y arqueo, sin alterar el código.

## 4. DEC-V12 — Comprobante interno imprimible y configurable (Q-V12) — CONFIRMADA EN EL MECANISMO DE EMISIÓN

Regla: tras confirmar una venta, el sistema genera un comprobante interno imprimible desde el navegador; el tamaño de impresión es configurable.

Requisitos funcionales: obtener el comprobante de una venta confirmada; vista previa; seleccionar el formato de impresión; usar la impresión del navegador; el comprobante queda vinculado permanentemente a la venta; imprimir NO crea una nueva venta; la reimpresión NO modifica importes históricos.

Formatos propuestos: papel térmico 58 mm, papel térmico 80 mm, A5, A4. Considerar márgenes, ancho imprimible, fuentes legibles y compatibilidad con controladores de impresión. No exigir marca o modelo de impresora para el MVP.

Contenido propuesto: identificación comercial de Joyería Sole; logo si se proporciona; leyenda «Comprobante interno»; número de venta; fecha y hora; productos y variantes; cantidades; precios unitarios; subtotales; total en Bs; desglose de pagos; importe recibido en efectivo y vuelto cuando corresponda; leyenda «No válido como factura fiscal».

Numeración: independiente de la factura fiscal. PENDIENTES: formato definitivo del correlativo; política sobre saltos; datos obligatorios del negocio; identificación del vendedor; reimpresión y su auditoría; configuración por usuario o por establecimiento; requisitos del contador. No introducir garantía de numeración continua sin decisión específica.

Relación con ADR: preparar la actualización propuesta para ADR-029, documentando el mecanismo de impresión y las alternativas descartadas.

## 5. Reorganización del roadmap (actualizar la propuesta de Fase 2)

- E0 — Estabilización previa: unificar operaciones del libro de inventario, validar idempotencia, concurrencia, integridad y recuperación.
- E1 — Venta de mostrador: venta atómica, pagos mixtos, consulta por código de barras y comprobante interno.
- E2 — Anulaciones: EXCLUIR del desarrollo autorizado. Conservar esta decisión como restricción explícita para los agentes.
- E3 — Caja y arqueo: caja única con apertura, cierre, asociación de pagos y cálculo del arqueo, DESPUÉS de cerrar las subdecisiones.
- E4 — Cambios de piezas: pendiente de definición; no confundir con anulación.
- E5 — Reportes: pendiente de confirmación funcional.
- E6 — Mejoras adicionales: fuera del MVP salvo aprobación específica.
- E7 — Piloto y aceptación: pruebas con operaciones reales supervisadas, conciliación de caja, inventario y comprobantes.

## 6. Evaluación de riesgos obligatoria

Analizar específicamente: ventas erróneas que no pueden anularse; venta duplicada por reintento; pérdida de conexión durante la confirmación; fallo de impresión después de una venta exitosa; cobro registrado incorrectamente; diferencia de efectivo; cierre concurrente de caja; venta realizada durante el cierre; pago mixto mal registrado; imposibilidad de recuperar datos tras una falla; venta y comprobante con importes inconsistentes; conflictos entre la política de no anulación y el proceso de cambios. Proponer controles y procedimientos sin implementar excepciones comerciales no autorizadas.

## 7. Instrucciones para Claude

Actuar como arquitecto de software, analista funcional y especialista en PostgreSQL. Antes de actualizar documentación: 1) consultar el estado actual del repositorio; 2) verificar las referencias Q-V07, Q-V09 y Q-V12; 3) contrastar las decisiones con el modelo y las reglas vigentes; 4) identificar ADR contradictorios o propuestas antiguas; 5) separar decisiones confirmadas de recomendaciones técnicas; 6) identificar el impacto en API, base de datos, permisos, frontend y pruebas; 7) presentar un diseño revisado sin modificar código.

## 8. Entregables (documentos de análisis)

1. Matriz de decisiones actualizada.
2. Diseño funcional del módulo de caja.
3. Propuesta del modelo de datos de ventas y caja.
4. Especificación del comprobante interno.
5. Análisis de impacto de la prohibición de anulaciones.
6. Roadmap actualizado.
7. Matriz de riesgos.
8. Lista de subdecisiones pendientes.

## 9. Restricciones

NO AUTORIZADO: modificar código fuente; crear migraciones; agregar endpoints; ejecutar cambios de base de datos; alterar permisos; actualizar ADR en el repositorio sin revisión; implementar módulos; desplegar; crear mecanismos de anulación encubiertos.

AUTORIZADO: análisis; revisión del repositorio; comparación documental; propuestas técnicas; elaboración de documentos para revisión; identificación de decisiones pendientes.

La implementación requerirá una autorización posterior, expresa y delimitada.

Resultado esperado: una especificación técnica coherente y lista para aprobación, sin cambios en el sistema existente.

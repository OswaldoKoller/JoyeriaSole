# Roadmap de Fase 1

Actualización 2026-10-11: catálogo e inventario quedan conectados por variante y SKU; la navegación se agrupa por módulo. Las opciones de Ventas son una vista previa de navegación, sin flujo de ventas implementado. El cliente aprobó nuevas reglas de costos, precios, conteos y catálogo en [RESOLUCIONES-2026-10-11.md](../business/RESOLUCIONES-2026-10-11.md); la aprobación no equivale a implementación.

Línea base de entregas: 2026-10-10. Este documento ordena entregas y define cuándo una tarea pasa de implementada a aceptada. El [arnés](HARNESS.md) establece cómo trabajar; la [plantilla](TASK-TEMPLATE.md) define cada tarea; el [registro de decisiones](../business/PENDIENTES.md) conserva las respuestas del cliente. No se asignan fechas hasta conocer las decisiones y capacidad de entrega.

## Estado comprobable

| Entrega                         | Estado al 2026-10-10                                                                | Evidencia y siguiente acción                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-PREP — entorno de QA         | Verificación local realizada                                                        | [Preparación](PHASE-1-PREPARATION.md): PostgreSQL efímero, pruebas y E2E. La instalación limpia y restauración del plan general siguen pendientes.                                                               |
| F1-01 — Proveedores             | Implementación y QA local completos; aceptación del cliente pendiente               | API, pantalla y auditoría; último `npm run qa` observado: 47 pruebas API, 4 de componentes y 3 E2E. Realizar revisión final y demo guiada en datos desechables.                                                  |
| F1-02 — Usuarios y acceso       | Implementación y QA local completos; aceptación del cliente pendiente               | [Tarea F1-02](F1-02-USERS.md): `npm run qa` del 2026-10-10 en verde, incluido el E2E de alta → login → cambio de contraseña.                                                                                     |
| F1-03 — Catálogo                | Categorías, atributos, productos y ejes implementados con pruebas de integración    | 13 pruebas API (dos niveles, duplicados, SKU correlativo, precio con permiso, código único/propio, búsqueda por código, combinaciones únicas). Falta E2E de catálogo; QR y P-25 pendientes.                      |
| F1-04 — Inventario e ingresos   | Saldos, alertas, historial y stock inicial implementados con pruebas de integración | 8 pruebas API: atomicidad movimiento/saldo/auditoría, una sola carga inicial, concurrencia del primer saldo, niveles y permisos. Ingresos y ajustes siguen sin implementar; P-07 y P-01 aprobadas, P-24 parcial. |
| F1-05 — Conteo físico y control | Pendiente de inventario y alcance de conteo                                         | P-13 permite movimientos durante conteo y exige conciliación; falta alcance. P-01 permite al responsable aprobar conteos y ajustes.                                                                              |

**Significado de estado.** «QA local completo» demuestra el comportamiento probado en la revisión actual; no significa aceptación del cliente ni producción lista. «Bloqueado» identifica la decisión que falta y permite continuar porciones independientes. La presencia de tablas o permisos en el esquema no cuenta como funcionalidad entregada.

## Próximas porciones tras las decisiones de 2026-10-11

| Orden | Entrega verificable                                                                                                                                                          | Estado y dependencia                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Catálogo: el cliente crea atributos/valores, asigna características a cada producto y genera etiqueta Code 128 con SKU.                                                      | Pendiente de implementar. Confirmar si también se conserva el código del proveedor; esa precisión no bloquea la etiqueta propia.                                         |
| 2     | Ingreso de mercadería existente: borrador editable, costos adicionales, ítems y confirmación única; prorrateo por valor, último costo y movimiento/saldo/auditoría atómicos. | P-07 aprobada. Se puede implementar con variantes existentes sin esperar los datos mínimos P-24. La confirmación no cambia automáticamente el precio hasta definir P-25. |
| 3     | Alta de piezas nuevas durante ingreso, incluso no esperadas.                                                                                                                 | P-24 confirma responsable y estado activo; completar los datos mínimos exigidos antes de permitir confirmación.                                                          |
| 4     | Precio calculado por variante y por categoría, edición y aprobación.                                                                                                         | P-03 aprobó fórmula general y flexibilidad; faltan redondeo, aprobador y vigencia P-25. Mantener precio vigente sin cambio hasta resolverlo.                             |
| 5     | Ajustes y conteo físico con movimientos concurrentes conciliados al aprobar.                                                                                                 | P-01 aprobada. P-13 exige conciliación; falta definir alcance antes de cerrar conteos.                                                                                   |
| 6     | Demostración y cierre de Fase 1.                                                                                                                                             | Revisión de permisos, integridad, QA aislado, aceptación del cliente y preparación operativa. Ventas sigue fuera de Fase 1.                                              |

## Flujo de una entrega

1. **Definir.** Crear una tarea con [TASK-TEMPLATE.md](TASK-TEMPLATE.md): resultado visible, alcance, P-xx pertinentes, responsable, aceptación y pruebas. Una tarea pasa a _lista_ solo si las decisiones que afectan su comportamiento están resueltas o su alcance las excluye explícitamente.
2. **Acordar contrato.** Describir pantalla/flujo, permisos, API y datos. Revisar invariantes y ADR antes de cambiar esquema. Registrar una nueva decisión pendiente cuando el contrato descubra una regla no definida.
3. **Construir una porción vertical.** Entregar API, interfaz y trazabilidad para un comportamiento verificable. Si se trabaja con varios agentes, asignar archivos disjuntos y un integrador; no compartir migraciones ni contratos simultáneamente.
4. **Verificar técnicamente.** Pruebas del riesgo concreto (incluidos 401/403/400, éxito y auditoría), `npm run qa` en BD efímera, revisión del diff y documentos. Guardar fecha, comando, resultado y límites. Un fallo se diagnostica antes de repetir; no se reduce el control para obtener verde.
5. **Revisar y demostrar.** Revisar autorización, datos expuestos, transacciones y regresiones; luego ejecutar el guion del cliente con datos sintéticos. Registrar observado vs esperado y clasificar cada comentario como defecto, decisión P-xx o mejora fuera de alcance.
6. **Cerrar.** La tarea está _verificada técnicamente_ tras el paso 4 y la revisión. Una entrega de negocio está _aceptada por el cliente_ cuando confirma el flujo previsto; una tarea interna sin demo se puede cerrar tras verificación técnica. Actualizar roadmap, documentación y siguiente tarea. Preparación para producción es una puerta aparte: CI remoto, recuperación ensayada, secretos saneados y operación decidida.

Las puertas son resultados, no trámites: una corrección pequeña no necesita crear documentos vacíos; una operación de stock exige evidencia transaccional y de concurrencia adicional.

## Lo siguiente para cerrar F1-01

| ID      | Acción                                                                                                                                                                                                  | Condición de salida                                                                                            | Responsable propuesto |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------- |
| F1-01-R | Revisar Proveedores contra contrato final: permisos por ruta, campos devueltos, NIT duplicado, auditoría y cambios de estado. Registrar defectos con escenario reproducible y corregir los confirmados. | Sin hallazgos de corrección o seguridad abiertos de prioridad alta; `npm run qa` verde tras cambios de código. | Desarrollo + revisión |
| F1-01-D | Preparar demostración aislada con usuario administrador y otro de solo lectura, proveedor ficticio y datos que puedan descartarse.                                                                      | Entorno y credenciales de demo separados de datos reales; recorrido repetible.                                 | Desarrollo            |
| F1-01-U | Ejecutar guion de aceptación con el cliente y anotar resultado de cada paso.                                                                                                                            | Cliente confirma el flujo o quedan observaciones clasificadas con responsable y criterio de resolución.        | Usuario/cliente       |
| F1-01-C | Cerrar la entrega y continuar F1-02 con respuestas P-19/P-21 registradas.                                                                                                                               | Estado del roadmap actualizado; ninguna observación bloqueante sin tarea.                                      | Coordinación          |

### Guion de aceptación de Proveedores

| Paso                                                            | Resultado esperado                                                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Iniciar sesión y abrir Inicio                                   | Se ven Inicio y Proveedores; la página activa está marcada.                                                                               |
| Registrar proveedor ficticio con nombre y NIT                   | Aparece en la lista; se puede buscar por nombre o NIT.                                                                                    |
| Editar teléfono o contacto                                      | El valor nuevo aparece; el equipo comprueba la auditoría mediante pruebas o consulta técnica, pues aún no existe una pantalla para verla. |
| Registrar otro proveedor con el mismo NIT                       | Se rechaza con conflicto sin crear un segundo registro.                                                                                   |
| Desactivar y filtrar inactivos                                  | El proveedor sigue consultable, marcado Inactivo.                                                                                         |
| Entrar como usuario con `suppliers:read` sin `suppliers:manage` | Puede consultar y no ve acciones de edición; el equipo comprueba por separado que la API rechaza escrituras directas.                     |
| Abrir `/proveedores` directamente y recargar                    | La ruta funciona con sesión válida y vuelve al login si no hay sesión.                                                                    |

Registrar cada fila como **pasa / falla / pendiente de decisión**, con fecha y observación. El guion no requiere productos, precios, stock ni decisiones comerciales ajenas al módulo.

## Orden después de Proveedores

1. **Usuarios y roles (F1-02):** habilitar administración de cuentas para probar permisos con personal real; varios roles ya aprobados (P-21), precisar vencimiento/contraseña P-19 y proteger el último administrador.
2. **Catálogo (F1-03):** categorías y atributos; después producto/variante, SKU y búsqueda. Resolver cada P-xx antes de la porción que dependa de él.
3. **Inventario e ingresos (F1-04):** primero movimientos/saldos y consultas; después ingreso en borrador y confirmación. La confirmación requiere costeo y concurrencia aprobados.
4. **Conteo y control (F1-05):** snapshot, captura, revisión, aprobación y alertas; validar permisos y movimientos ocurridos durante conteo.

El siguiente módulo puede prepararse mientras el cliente prueba F1-01, siempre que sus reglas pendientes no se implementen por inferencia. La decisión de publicar, desplegar o modificar datos reales se trata por separado.

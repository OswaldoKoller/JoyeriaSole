# Preparación de Fase 1 y primera entrega

Fecha: 2026-10-08. El usuario autoriza avanzar con los preparativos de Fase 1 para disponer de una entrega que pueda validar con el cliente. Esta autorización no resuelve las decisiones P-xx. El estado histórico del [plan de verificación](VERIFICATION-PLAN.md) se conserva como antecedente.

## Objetivo y alcance de esta preparación

Establecer una base comprobable: entorno de QA desechable, pruebas que no dependan de credenciales reales, evidencia de calidad y tareas verticales con aceptación. Responsabilidad: coordinación de la sesión, sin delegación simultánea.

El repositorio tiene ahora un commit inicial fa4b5b1 (fase 1), sin cambios al comenzar esta preparación. No se observó remoto configurado. Las doce skills locales aparecen en el catálogo de esta sesión. Los perfiles de agentes están definidos; esta tarea no necesita activar diez procesos.

## Primera entrega propuesta

Comenzar por proveedores: es un flujo pequeño y visible para la tienda, previo a ingresos y con pocas dependencias comerciales. La consulta de prioridad al usuario queda abierta; si prefiere usuarios o catálogo, reordenar las tareas sin perder la preparación técnica.

Demostración prevista: iniciar sesión → listar proveedores → registrar uno → editar contacto → desactivar → confirmar que se conserva su historial. La demo usa datos ficticios identificados como tales, nunca el stock real del cliente.

## Backlog ejecutable

### F1-PREP — base de calidad

- Estado: terminada; ver evidencia al final.
- Objetivo: ejecutar los controles existentes y E2E sobre PostgreSQL exclusivo de la ejecución.
- Alcance: runner QA, destino de tests, configuración E2E, documentación y pruebas de rechazo de destinos inseguros.
- Aceptación: contenedor nuevo con puerto dinámico ligado a localhost; URL de test explícita; limpieza solo del contenedor creado; login E2E no omitido por falta de credenciales; servidores propios; errores no imprimen URLs con contraseñas.
- Recuperación: finalizar contenedor efímero; revertir únicamente el diff de esta tarea si fuera necesario. No cambiar datos de desarrollo.
- Verificación: npm run qa (check completo + migraciones/seed + E2E) y revisión del diff.

### F1-01 — proveedores de punta a punta

- Estado: terminada tras aprobación del usuario el 2026-10-09; ver evidencia al final.
- Responsable: backend y frontend; revisión de seguridad/pruebas antes del cierre.
- Requisitos: entidad Supplier existente, permisos suppliers:read/suppliers:manage y auditoría; comprobar nombres y campos exactos antes del contrato.
- Alcance: lista paginada, búsqueda, alta, edición, activación/desactivación; sin borrado físico ni compras automáticas.
- Aceptación: usuario autorizado crea y encuentra proveedor; cambios persistidos y auditados en la misma transacción; desactivación conserva historial; sin sesión 401, sin permiso 403, datos inválidos 400; interfaz con estados vacío/cargando/error, labels y navegación por teclado.
- Archivos previstos: módulo suppliers API, contratos shared, feature suppliers web, rutas, pruebas y documentación API.
- Dependencias: F1-PREP y contrato revisado contra esquema. No inventar reglas sobre duplicidad de NIT/documento: confirmar necesidad con cliente o limitarse a restricciones ya aprobadas.
- Evidencia de cierre: integración con BD real, componentes y E2E crear/editar/desactivar, más check.

### F1-02 — usuarios y acceso

- Estado: por detallar.
- Alcance: administración básica, cambio de contraseña, desactivación e invalidación de sesiones según contrato aprobado; preservar roles preliminares del seed.
- Aceptación: acceso solo por permiso; contraseñas nunca expuestas; usuario desactivado no opera; cambios auditados; protección frente a pérdida del último acceso administrativo a definir en el contrato.
- Dependencias: F1-PREP; aclarar P-21 para asignación de uno/varios roles y P-19 para política definitiva. La autenticación actual sirve de base, no prueba administración completa.

### F1-03 — catálogo utilizable

- Estado: bloqueado parcialmente por decisiones.
- Alcance: categorías, atributos, productos y variantes, búsqueda por SKU/código, permisos de costos, precio explícito.
- Aceptación: producto con al menos una variante; SKU/código únicos; datos sensibles omitidos según permiso; comportamiento de desactivación definido.
- Dependencias: P-04/P-05/P-06/P-15/P-22 y moneda/unidades si la pantalla las utiliza. F1-01 no es requisito técnico del catálogo salvo contrato que lo relacione.

### F1-04 — inventario e ingresos

- Estado: bloqueado por reglas comerciales y catálogo.
- Aceptación: saldo/movimiento/auditoría atómicos; borrador no cambia stock; confirmar una vez; rollback completo; concurrencia sin pérdida de cantidades, incluido primer saldo.
- Dependencias: F1-03, P-07/P-08/P-09/P-11/P-12/P-20/P-24. No implementar precio costo × 2 como supuesto.

### F1-05 — conteo y control

- Estado: bloqueado parcialmente.
- Aceptación: snapshot, conteo, diferencias, aprobación y movimientos trazables; consultas sin stock/bajo mínimo e historial con filtros.
- Dependencias: F1-04, P-01/P-13; definir umbral exacto de bajo mínimo para evitar discrepancia entre documentos.

## Validación con el cliente

En la primera reunión pedir ejemplos reales sin datos sensibles: un proveedor, un producto con variantes, una recepción y una diferencia de conteo. Registrar tarea, resultado esperado, resultado observado y decisión pendiente. No tratar una preferencia visual como cambio de regla de inventario.

Prioridad de decisiones antes de catálogo/inventario: unidad de control, moneda, SKU, códigos y listas de atributos; después negativos, costeo y conteos. Usar el [registro P-xx](../business/PENDIENTES.md), anotando fecha y aprobador solo al recibir respuesta explícita.

La demostración inicial no equivale a lanzamiento: hosting, respaldo/restauración, RPO/RTO y revocación de credenciales expuestas siguen pendientes para operación real.

## Evidencia de esta preparación

Validado el 2026-10-08 en Windows, sobre fa4b5b1 más el diff de preparación. No se hicieron commits ni publicación.

| Comprobación                                                          | Resultado observado                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primera ejecución npm run qa                                          | Lint, formato, tipos y 41 tests API correctos; Vitest web falló al arrancar el worker forks, sin ejecutar casos                                                                 |
| Diagnóstico npm test -w @joyeria/web -- --pool=threads --maxWorkers=1 | 2 tests correctos; se adoptó threads con un worker para componentes, sin cambiar aserciones ni timeouts                                                                         |
| Segunda ejecución npm run qa                                          | Código de salida 0: lint, formato, tipos, 41 tests API, 2 componentes, build, migraciones, seed y 2 E2E Chromium correctos                                                      |
| Aislamiento                                                           | Contenedor PostgreSQL nuevo por ejecución, puerto dinámico ligado a 127.0.0.1, base joyeria_test y credenciales sintéticas; eliminación al salir, también tras el fallo inicial |
| Protecciones nuevas                                                   | 9 pruebas de destino: aceptación local, rechazo de otros nombres/hosts/protocolos/parámetros y ausencia de filtración de credenciales en errores                                |
| E2E                                                                   | Redirección sin sesión y login/logout del administrador sintético; ningún caso omitido por credenciales faltantes                                                               |
| Git y documentación                                                   | Diff revisado; git diff --check y enlaces comprobados                                                                                                                           |
| CI                                                                    | Workflow ampliado con instalación de Chromium y npm run qa:e2e; ejecución remota no verificada, sin remoto configurado                                                          |

Build web correcto con advertencia de chunk de 656.27 kB (199.10 kB gzip). Registrar revisión de carga y división por rutas al crecer las pantallas; no se cambió el umbral para ocultar la advertencia. El cambio de worker resolvió las ejecuciones observadas, pero no demuestra ausencia de futuros fallos intermitentes.

Esta comprobación usa dependencias locales instaladas. La instalación limpia desde lockfile, el ensayo de restauración y el arranque de imagen de producción del plan general siguen pendientes; no son resultados implícitos de npm run qa.

## Evidencia de F1-01 — Proveedores

Validado el 2026-10-09 con `npm run qa` sobre PostgreSQL efímero: lint, formato, tipos, build, 47 pruebas API, 3 pruebas de componentes y 3 E2E en Chromium pasaron. El E2E nuevo creó, editó y desactivó un proveedor sintético desde la interfaz. Las pruebas de integración cubren 401, 403, 400, 404, NIT duplicado (409), búsqueda, filtros, paginación y auditoría antes/después.

La implementación usa la tabla y permisos existentes; no requirió migración. El build web advirtió sobre un chunk de 669.63 kB (201.73 kB gzip), pendiente de revisar cuando crezca la interfaz. Al terminar Playwright, el proceso de Vite produjo un mensaje de ciclo de vida de npm en Windows, pero los tres E2E pasaron y el comando salió con código 0. No se ejecutó CI remoto ni se hizo commit o push.

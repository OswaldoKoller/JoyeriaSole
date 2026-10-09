# Plan de verificación del estado del proyecto

Fecha: 2026-10-08. Propósito: determinar qué existe, qué funciona y qué falta para entregar el inventario de Joyería Sole. Alcance de esta entrega: preparar skills/agentes y elaborar este plan; no ejecutar todavía una auditoría completa ni iniciar funcionalidades de Fase 1.

## 1. Estado inicial y confiabilidad

| Aspecto              | Evidencia observada en esta sesión                                                   | Estado                                                               |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Arquitectura         | npm workspaces con API, web y shared; documentación y 12 ADR                         | Estructura presente; conformidad pendiente                           |
| Dominio implementado | Módulos auth, audit y health; esquema de inventario y documentación                  | No equivale a Fase 1 terminada                                       |
| Git                  | git status: archivos sin seguimiento; git log: main sin commits; git remote -v vacío | Sin línea base versionada ni remoto local                            |
| Herramientas         | Node 22.22.3, npm 10.9.8, Python 3.11.3                                              | Versiones observadas; reproducibilidad pendiente                     |
| Pruebas históricas   | Adjunto afirma 34 tests, 2 E2E y Docker funcional                                    | Antecedente, no validación actual                                    |
| CI                   | Workflow presente: lint, formato, tipos, migraciones, tests y build Docker           | Configuración inspeccionada; ejecución remota no verificada          |
| E2E                  | Playwright carga entorno raíz, reutiliza servidores y declara BD de desarrollo       | Aislamiento pendiente; no existe paso E2E en CI                      |
| Integración          | resetDatabase ejecuta TRUNCATE de tablas públicas                                    | Exige destino desechable comprobado antes de ejecutar                |
| Negocio              | P-01 a P-27 documentados                                                             | Revisar resolución con cliente antes del módulo afectado             |
| Credenciales         | El adjunto contiene contraseña y token expuestos                                     | Requiere revocación/cambio por titular; no se reproducen ni usan     |
| Arnés                | AGENTS.md, 12 skills locales, 10 perfiles TOML y dos skills personales oficiales     | Archivos preparados; descubrimiento en siguiente turno por confirmar |

Fuentes: [package.json](../../package.json), [API](../../apps/api/src/modules/), [CI](../../.github/workflows/ci.yml), [Playwright](../../apps/web/playwright.config.ts), [helper de BD](../../apps/api/test/helpers/db.ts), [pendientes](../business/PENDIENTES.md). No se inspeccionaron valores de .env.

## 2. Método y evidencias

Cada comprobación genera una fila: ID, requisito, archivo/ubicación, prueba o comando, entorno, fecha, salida, estado y tarea resultante. Estados: verificado / fallo / bloqueado / no ejecutado. Guardar resultados sanitizados en el informe de auditoría que se produzca al ejecutar este plan. Sin commit inicial, identificar snapshot con listado y huellas de archivos relevantes; no inventar SHA.

Separar fallo de producto, fallo de infraestructura y falta de decisión comercial. Priorizar P0 (exposición activa o pérdida de datos), P1 (integridad/autorización o bloqueo de entrega), P2 (funcionalidad/calidad), P3 (mejora). Asignar severidad final a partir de evidencia, no del nombre del componente.

## 3. Etapas ordenadas

| Etapa                           | Trabajo                                                                                              | Responsable              | Condición de salida                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| V0 — Arnés                      | Validar skills, TOML, referencias, alcance y reconocimiento del cliente                              | planning + documentation | Archivos válidos y limitaciones de activación explícitas                           |
| V1 — Línea base segura          | Inventario Git, scripts, versiones, ignores y credenciales; identificar datos que pueden descartarse | devops + security        | Snapshot identificable; secretos fuera del informe; destinos de prueba comprobados |
| V2 — Construcción reproducible  | Instalar desde lockfile en copia limpia, generar Prisma, lint, formato, tipos y build                | devops + backend         | Cada comando registra salida real; no depender de node_modules anterior            |
| V3 — Arquitectura y datos       | Contrastar ADR, esquema, SQL y llamadas; migrar BD vacía desechable y validar restricciones          | architecture + database  | Matriz de invariantes, migraciones reproducibles y divergencias documentadas       |
| V4 — Comportamiento y seguridad | Unitarias, componentes, integración y revisión de auth, permisos, sesiones, errores y dependencias   | testing + security       | Flujos existentes comprobados; fallos con reproducción e impacto                   |
| V5 — E2E y operación            | Aislar E2E; navegador; arranque Docker; salud, login y restauración en base desechable               | testing + devops         | Evidencia de ejecución completa y recuperación; no solo imagen construida          |
| V6 — Producto y tareas          | Matriz requisito/código/prueba; dependencias P-xx; backlog por módulos                               | planning + review        | Estado real y tareas listas, bloqueadas o propuestas claramente separadas          |

Los roles son responsabilidades; no es necesario ejecutar agentes simultáneos. La preparación de este plan no activa despliegues, commits ni correcciones de aplicación.

### V1 y V2: entorno y comandos

1. Revisar README, scripts npm, Dockerfile, compose, configuración Vitest y Playwright antes de ejecutar. Confirmar Git/Node/npm/Docker y espacio disponible. Consultar estado Docker sin imprimir variables o secretos.
2. Crear copia de trabajo y PostgreSQL desechables para diagnóstico reproducible. Elegir puertos libres; comprobar host y nombre exacto de BD y que difiera de desarrollo. Proveer credenciales de prueba nuevas y limitadas. No ejecutar db:reset ni limpieza sobre el volumen actual.
3. En entorno aislado: npm ci, npm run db:generate, npm run lint, npm run format:check, npm run typecheck, npm run build. Registrar cada resultado. No corregir todo el formato automáticamente en el diagnóstico.
4. Revisar global-setup y la carga dotenv; configurar DATABASE_URL y TEST_DATABASE_URL al destino aislado cuando corresponda. Aplicar npm run db:deploy solamente allí.
5. Ejecutar npm run test:unit y npm run test:integration. npm run check reúne controles generales, pero no incluye E2E, arranque Docker ni restauración. Una repetición completa solo se justifica por cambios o incertidumbre restante.

### V3 y V4: controles por riesgo

- Arquitectura: routes → service → Prisma, contratos Zod compartidos, ausencia de lógica de negocio duplicada, límites del futuro servicio de inventario.
- Datos: unicidad SKU/barcode, claves foráneas, Decimal, append-only, ecuación de movimiento, atomicidad de saldo/movimiento/auditoría, migraciones desde vacío. Comparar garantías SQL y garantías que faltan en servicio.
- Concurrencia: listar pruebas necesarias para saldos nuevos, actualizaciones concurrentes y doble confirmación. Cuando el servicio aún no existe, registrar brecha funcional; no reportar prueba pasada ni bug de un endpoint inexistente.
- Auth: login/logout, sesión expirada, usuario inactivo, 401/403, CSRF/orígenes, cookies, rate limit, respuesta sin hashes/tokens y redacción de logs. Comprobar permisos de costos por campo, además de controles de pantalla.
- Dependencias: ejecutar npm audit, evaluar dependencia directa/transitiva, uso en desarrollo/producción y explotabilidad; no adoptar sin revisar la antigua afirmación de cuatro avisos inocuos.
- UI: teclado, foco, lector como teclado+Enter, carga/vacío/error y mensajes en español. No fijar BOB ni formato SKU por suposición.

### V5: E2E, CI y recuperación

La configuración actual de Playwright usa la base de desarrollo. Crear una tarea previa para pasar entorno aislado a la API y usar puertos propios o comprobar que no haya servidores ajenos; evitar reuseExistingServer en la comprobación reproducible. Sembrar solo usuarios y datos sintéticos en esa base. Después instalar Chromium de la versión del lockfile y ejecutar npm run test:e2e.

Construir imagen Docker y arrancarla contra otra BD desechable; comprobar migraciones, health, SPA y login. Validar usuario sin privilegios y cierre limpio. Ensayar backup/restauración con datos sintéticos y comparar conteos/integridad; proponer RPO/RTO para aprobación, sin inventar objetivos del cliente.

Revisar la adición de E2E a CI cuando su aislamiento esté resuelto. La verificación remota depende de un repositorio configurado y de una acción de publicación autorizada; no confundir archivo YAML presente con workflow ejecutado. Hosting P-18 y despliegue siguen pendientes.

### V6: cobertura del producto

| Área de Fase 1    | Revisar / dependencia antes de implementar                                         |
| ----------------- | ---------------------------------------------------------------------------------- |
| Usuarios y roles  | Auth actual vs administración pendiente; permisos P-01/P-02 y política de usuarios |
| Proveedores       | Contrato, validación, duplicados, desactivación y auditoría                        |
| Catálogo          | Categorías P-04, SKU P-05, códigos P-06, atributos P-15, visibilidad de costos     |
| Inventario        | Saldos/movimientos; negativos P-08, unidades P-09, motivos P-20                    |
| Ingresos          | Costeo P-07, recepción P-12, nuevos productos P-24; confirmación atómica           |
| Inventario físico | Aprobaciones P-01, alcance/bloqueo P-13, snapshot y diferencias                    |
| Operación         | Moneda P-10, hosting P-18, respaldo y recuperación                                 |

Releer todas las decisiones P-01 a P-27; esta tabla no sustituye el registro completo. Incluso un módulo sin dependencia comercial requiere autorización de implementación y criterios de aceptación.

## 4. Backlog inicial de diagnóstico

| ID       | Prioridad propuesta | Tarea y aceptación                                                                        | Dependencia                              |
| -------- | ------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| SEC-001  | P0 preventiva       | Titular revoca token expuesto y cambia contraseña; confirmar acción sin registrar valores | Acceso del titular a GitHub y sistema    |
| ENV-001  | P1                  | Establecer snapshot y entorno desechable con identidad verificada                         | V1                                       |
| QA-001   | P1                  | Reproducir controles y documentar cada fallo sin ocultar reintentos                       | ENV-001                                  |
| QA-002   | P1                  | Aislar E2E y comprobar que API/BD no apuntan a desarrollo                                 | ENV-001; cambio por asignar              |
| DATA-001 | P1                  | Matriz de invariantes y migraciones desde vacío con evidencia                             | ENV-001                                  |
| SEC-002  | P1                  | Revisar auth, autorización y dependencias; reportar escenarios verificables               | QA-001                                   |
| OPS-001  | P2                  | Arranque de imagen y restauración aislada documentados                                    | DATA-001                                 |
| CI-001   | P2                  | Incorporar E2E aislado y verificar workflow remoto                                        | QA-002, remoto/publicación autorizados   |
| PROD-001 | P1                  | Resolver decisiones del próximo módulo y crear tareas verticales aceptables               | Registro P-xx y cliente                  |
| GIT-001  | P2                  | Preparar primer commit y remoto con revisión de secretos                                  | Solicitud de commit/publicación; SEC-001 |

SEC-001 no impide elaborar documentos o revisar código sin credenciales. Las prioridades definitivas se ajustan al diagnóstico. Cada tarea de implementación se detalla con la [plantilla](TASK-TEMPLATE.md).

## 5. Entregables y salida del diagnóstico

- Informe con evidencia actual, limitaciones y matriz requisito → implementación → prueba.
- Riesgos clasificados y reproducibles; decisiones del cliente con su impacto.
- Backlog ordenado por dependencias, aceptación y responsable.
- Recomendación de inicio de Fase 1 sustentada en resultados, sin sustituir aprobación comercial.

Se puede iniciar una tarea cuando su comportamiento está definido, sus decisiones bloqueantes resueltas y existe una forma segura de probarla. No declarar proyecto listo para producción hasta comprobar también seguridad, recuperación y operación en el entorno elegido.

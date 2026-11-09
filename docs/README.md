# Documentación

Índice de la documentación del proyecto. Cada documento se clasifica como **vigente** (describe el sistema o la
decisión actual), **histórico** (fotografía fechada que se conserva como antecedente) u otro estado indicado.
Si un documento histórico contradice a uno vigente, prevalece el vigente.

**Estado actual del trabajo:** [plan de desarrollo](engineering/PLAN-DESARROLLO-F1-2026-11.md), sección 12 (estado
por rebanada, foto del 2026-11-05), y el [CHANGELOG](../CHANGELOG.md) para los cambios posteriores. Las decisiones
de negocio y su estado están en [PENDIENTES.md](business/PENDIENTES.md).

## Guías y referencia técnica (vigentes)

| Documento                                                    | Contenido                                                |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| [DEVELOPMENT.md](DEVELOPMENT.md)                             | Instalación, comandos, flujo de trabajo, depuración      |
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) | Arquitectura, stack y justificación, capas, evolución    |
| [database/DATABASE.md](database/DATABASE.md)                 | Modelo de datos, restricciones, migraciones, seed        |
| [api/API.md](api/API.md)                                     | Convenciones, formato de respuestas y errores, endpoints |
| [security/SECURITY.md](security/SECURITY.md)                 | Medidas de seguridad, reglas, riesgos aceptados          |
| [deployment/DEPLOYMENT.md](deployment/DEPLOYMENT.md)         | Hosting y pasos de despliegue (aún no desplegado, P-18)  |
| [deployment/BACKUPS.md](deployment/BACKUPS.md)               | Estrategia de respaldo y restauración (propuesta, P-26)  |
| [deployment/LOCAL.md](deployment/LOCAL.md)                   | Despliegue local con un comando para demostraciones      |
| [testing/TESTING.md](testing/TESTING.md)                     | Niveles de prueba, BD de test, qué probar                |
| [decisions/](decisions/README.md)                            | Registro de decisiones de arquitectura (ADR 001 a 021)   |

## Negocio

| Documento                                                                                | Estado    | Contenido                                                                   |
| ---------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| [business/DOMINIO.md](business/DOMINIO.md)                                               | Vigente   | Conceptos y flujos de negocio de la Fase 1                                  |
| [business/PENDIENTES.md](business/PENDIENTES.md)                                         | Vigente   | **Registro de decisiones de negocio** (fuente única de estados P-xx)        |
| [business/RESOLUCIONES-2026-11-05.md](business/RESOLUCIONES-2026-11-05.md)               | Vigente   | Última respuesta del cliente; su sección 7 prevalece sobre las anteriores   |
| [business/RESOLUCIONES-2026-10-11.md](business/RESOLUCIONES-2026-10-11.md)               | Histórico | Respuestas del 2026-10-11; su fórmula de precio `× 2` fue sustituida (P-03) |
| [business/RESOLUCIONES-2026-10-09.md](business/RESOLUCIONES-2026-10-09.md)               | Histórico | Respuestas del 2026-10-09; varias reglas fueron cambiadas después           |
| [business/DECISIONES-ABIERTAS-2026-11-05.md](business/DECISIONES-ABIERTAS-2026-11-05.md) | Histórico | Preguntas del equipo tras la reunión del 2026-11-05, ya respondidas         |
| [business/CUESTIONARIO-REUNION-CLIENTE.md](business/CUESTIONARIO-REUNION-CLIENTE.md)     | Histórico | Cuestionario previo a la reunión; su sección 1 está superada                |

## Ingeniería y planificación

| Documento                                                                                  | Estado      | Contenido                                                                         |
| ------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------- |
| [engineering/PLAN-DESARROLLO-F1-2026-11.md](engineering/PLAN-DESARROLLO-F1-2026-11.md)     | Vigente     | Plan por rebanadas S0 a S13; la sección 12 resume el estado (foto del 2026-11-05) |
| [engineering/ROADMAP.md](engineering/ROADMAP.md)                                           | Por decidir | Criterios de aceptación; su estado es del 2026-10-10 y no refleja S0 a S13        |
| [engineering/PHASE-1-PREPARATION.md](engineering/PHASE-1-PREPARATION.md)                   | Histórico   | Preparación y evidencias de octubre de 2026                                       |
| [engineering/F1-02-USERS.md](engineering/F1-02-USERS.md)                                   | Histórico   | Tarea F1-02 Usuarios y acceso (octubre de 2026)                                   |
| [engineering/F1-ANALISIS-FASES-2026-10-13.md](engineering/F1-ANALISIS-FASES-2026-10-13.md) | Histórico   | Análisis de fases del 2026-10-13                                                  |
| [engineering/HARNESS.md](engineering/HARNESS.md)                                           | Vigente     | Arnés de trabajo con agentes; para estados de decisiones ver PENDIENTES           |
| [engineering/VERIFICATION-PLAN.md](engineering/VERIFICATION-PLAN.md)                       | Histórico   | Plan de diagnóstico del 2026-10-08                                                |
| [engineering/TASK-TEMPLATE.md](engineering/TASK-TEMPLATE.md)                               | Plantilla   | Plantilla para describir una tarea                                                |

## Informe técnico y propuestas

| Documento                                                            | Naturaleza                | Contenido                                                                          |
| -------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| [informe-tecnico/](informe-tecnico/00-resumen-ejecutivo-e-indice.md) | Fotografía del 2026-11-07 | Informe técnico en 7 partes: historia, arquitectura, API, datos, frontend y estado |
| [propuestas/fase-2-ventas/](propuestas/fase-2-ventas/README.md)      | Propuesta para revisión   | Análisis de la Fase 2 (Ventas) para revisión; no autoriza implementar nada         |

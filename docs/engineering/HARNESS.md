# Arnés de desarrollo de Joyería Sole

El arnés conecta requisitos, contexto para agentes, herramientas, comprobaciones y evidencia. Su resultado esperado es una tarea reproducible cuya aceptación se puede comprobar.

## Estructura instalada

| Elemento                                        | Función                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| [AGENTS.md](../../AGENTS.md)                    | Entrada común, invariantes y ciclo de trabajo                                       |
| [CLAUDE.md](../../CLAUDE.md)                    | Convenciones existentes del producto                                                |
| [Skills del repositorio](../../.agents/skills/) | Diez adaptadores sole-* de las áreas existentes y dos flujos de diagnóstico/entrega |
| [Referencias existentes](../../.claude/skills/) | Detalle técnico reutilizado sin duplicar manuales                                   |
| [Agentes Codex](../../.codex/agents/)           | Diez perfiles TOML nativos, sin fijar modelo ni permisos globales                   |
| [Agentes Claude](../../.claude/agents/)         | Ocho perfiles existentes preservados                                                |
| [Plantilla de tarea](TASK-TEMPLATE.md)          | Contrato de entrada y evidencia de cierre                                           |
| [Plan](VERIFICATION-PLAN.md)                    | Secuencia de diagnóstico y backlog inicial                                          |
| [Roadmap](ROADMAP.md)                           | Orden de entregas, puertas de calidad y aceptación del cliente                      |

Skills adicionales instaladas en el entorno personal mediante el instalador oficial de openai/skills: security-best-practices y security-threat-model. Son auxiliares para revisiones solicitadas; las skills locales no dependen de ellas. No se instalaron conectores ni proveedores de hosting por no existir necesidad confirmada. Git/PR/CI ya cuentan con skills del cliente.

## Selección de roles

| Rol                | Activación y entrega                                              |
| ------------------ | ----------------------------------------------------------------- |
| sole-planning      | Diagnóstico y planificación: matriz de estado y tareas aceptables |
| sole-architecture  | Decisión estructural: alternativas, límites e impacto/ADR         |
| sole-database      | Esquema e integridad: migración revisada y evidencia              |
| sole-backend       | API: contrato, autorización, transacción y tests                  |
| sole-frontend      | Interfaz: flujo usable, teclado y estados                         |
| sole-security      | Riesgo: escenario, evidencia y corrección propuesta               |
| sole-testing       | Calidad: pruebas por riesgo y diagnóstico reproducible            |
| sole-devops        | Operación: construcción, CI, arranque y recuperación              |
| sole-documentation | Trazabilidad: documentos coherentes con el resultado              |
| sole-review        | Revisión: hallazgos de corrección y regresiones sin editar        |

Un perfil no es un proceso activo. El cliente debe admitir y descubrir perfiles nativos; esta entrega valida sus archivos, no una ejecución de cada agente. Si el cliente no los carga, el coordinador puede leer el perfil y seguirlo en la sesión actual. Las listas de archivos son un contrato de colaboración, no una barrera de seguridad.

Las skills deben estar disponibles en el siguiente turno; si no aparecen, recargar la sesión. Comprobar invocación con $sole-project-assessment. No afirmar activación automática sin verla en el catálogo del cliente.

## Flujo práctico

1. Crear tarea lista: objetivo, decisión de negocio y aceptación comprobable.
2. Cargar solo contexto pertinente. Verificar archivos y comandos reales, no depender del informe histórico.
3. Trabajar en una porción vertical pequeña. Delegar solo dentro de la autorización vigente, con entradas y archivos disjuntos; no lanzar todos los roles por defecto.
4. Ejecutar controles proporcionales. Para código: lint, tipos, tests pertinentes y build; integración/E2E con datos desechables. Para documentación: formato, enlaces y metadatos.
5. Revisión y cierre con resultados observados. Si falla, guardar primera evidencia, diagnosticar y repetir tras una corrección o hipótesis específica.

Estado bloqueado requiere causa, responsable y condición de desbloqueo. Las partes independientes pueden seguir. Ni CI verde prueba que el producto esté completo ni un porcentaje de cobertura sustituye pruebas de reglas críticas.

## Mantenimiento

Las skills sole-* enlazan referencias Claude y añaden correcciones concretas: P-09 y P-10 no están resueltos; test:unit incluye web; bloqueo de fila no cubre saldo inexistente. El runner npm run qa aísla PostgreSQL y E2E (ver [pruebas](../testing/TESTING.md)). Al cambiar una referencia, revisar su adaptador. Actualizar reglas solo por decisiones aprobadas o fallos demostrados; no acumular procedimientos especulativos.

Medir por tarea: aceptación satisfecha, defectos escapados, fallos intermitentes reproducidos y tiempo bloqueado por decisiones. Crear nueva automatización únicamente si elimina una repetición comprobada.

## Fuentes de configuración

Consultadas el 2026-10-08:

- [Skills oficiales](https://learn.chatgpt.com/docs/build-skills): descubrimiento desde .agents/skills, metadatos name/description.
- [Subagentes oficiales](https://developers.openai.com/codex/subagents): perfiles .codex/agents con name, description y developer_instructions.
- [Catálogo oficial de skills](https://github.com/openai/skills/tree/main/skills/.curated).

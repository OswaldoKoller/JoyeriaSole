# Joyería Sole — instrucciones para agentes

Sistema de inventario de joyería en Bolivia. Leer [CLAUDE.md](CLAUDE.md) para convenciones e invariantes y [DOMINIO.md](docs/business/DOMINIO.md) para alcance. Preparativos de Fase 1 autorizados el 2026-10-08, módulo F1-01 Proveedores aprobado y continuación F1-02 indicada el 2026-10-09; ver [plan actual](docs/engineering/PHASE-1-PREPARATION.md). Las decisiones P-xx requieren su resolución explícita.

## Contexto y fuentes

- Arquitectura: [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md); decisiones: [ADRs](docs/decisions/README.md).
- Negocio sin resolver: [PENDIENTES.md](docs/business/PENDIENTES.md). Una propuesta o un campo existente no equivalen a una regla aprobada.
- Procedimientos específicos: [skills locales](.agents/skills/) que enlazan las referencias existentes de Claude. Cargar solo el área pertinente.
- Operación de agentes y validación: [HARNESS.md](docs/engineering/HARNESS.md).
- Plan de diagnóstico: [VERIFICATION-PLAN.md](docs/engineering/VERIFICATION-PLAN.md).
- Flujo de entregas y criterios de cierre: [ROADMAP.md](docs/engineering/ROADMAP.md).

Las instrucciones del usuario prevalecen. Si documentos discrepan, registrar la discrepancia; aplicar las [resoluciones del cliente](docs/business/RESOLUCIONES-2026-10-09.md) sin confundir decisión aprobada con regla ya implementada. P-03 y P-07 siguen pendientes; P-10 aprobó solo bolivianos y P-19 aprobó sesión fija (8 horas desde el 2026-11-05; antes 3), mínimo 10 caracteres y sin 2FA. Los ajustes explícitos de las skills sole-* corrigen ejemplos provisionales de sus referencias.

## Ciclo de trabajo

1. Precisar objetivo, aceptación observable, alcance, dependencias P-xx y responsable usando la [plantilla de tarea](docs/engineering/TASK-TEMPLATE.md).
2. Inspeccionar código y estado Git. Respetar trabajo existente; no asumir HEAD, develop o remoto.
3. Implementar el cambio mínimo autorizado. Mantener monolito modular: routes → service → Prisma; contratos compartidos en packages/shared.
4. Verificar comportamiento y riesgos afectados. Registrar comando, fecha, resultado y entorno sin secretos. Una comprobación no ejecutada nunca cuenta como aprobada.
5. Revisar diff y documentos afectados. Entregar pendientes concretos y evidencia.

Stock por variante; movimiento, saldo y auditoría atómicos. No modificar migraciones aplicadas. No asumir que tablas diseñadas equivalen a funcionalidades terminadas.

## Ejecución y seguridad

- Revisar scripts y destino antes de ejecutar integración: los helpers hacen TRUNCATE. Base desechable con host/nombre exactos verificados y diferente de desarrollo/producción; no basta buscar la palabra test.
- Usar npm run qa para controles y E2E con PostgreSQL efímero; E2E exige destino de test explícito y servidores propios. No reutilizar datos de desarrollo.
- Nunca volcar .env, tokens, cookies o el adjunto en informes. Revocación de credenciales expuestas corresponde al titular.
- No reset, borrado de datos, commit, push ni despliegue sin autorización aplicable. No repetir aprobaciones ya otorgadas.
- No reducir controles o ignorar fallos para obtener verde. Tras un fallo, diagnosticar antes de reintentar.

## Skills y roles

Doce skills sole-* en [.agents/skills](.agents/skills/). Diez perfiles nativos en [.codex/agents](.codex/agents/): planning, architecture, database, backend, frontend, security, testing, devops, documentation y review.

Los perfiles definen responsabilidades, no prueban que el cliente los haya cargado ni imponen permisos de filesystem. Respetar herramientas y permisos de la sesión. Delegar solo cuando lo autorice el usuario o instrucciones aplicables; una tarea pequeña puede completarse con un único agente. Si hay delegación, asignar archivos disjuntos; el coordinador integra y verifica. No editar en paralelo esquema, lockfile o contratos compartidos.

## Terminado

Aceptación satisfecha; revisión de cambios; pruebas pertinentes; decisiones pendientes preservadas; documentación consistente. Para código, ejecutar npm run check tras verificar aislamiento y añadir E2E cuando cambien flujos críticos. Para cambios solo documentales, validar enlaces, metadatos y formato; la auditoría completa de la aplicación es una tarea separada. Fallos previos se reportan por separado, sin declararlos corregidos.

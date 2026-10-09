---
name: sole-database-design
description: Modificar o revisar Prisma, migraciones e integridad de datos de Joyería Sole.
---

# Modificar o revisar Prisma, migraciones e integridad de datos de Joyería Sole.

Leer [AGENTS.md](../../../AGENTS.md) y la [referencia del área](../../../.claude/skills/database-design/SKILL.md). Las rutas de código que esa referencia presenta se resuelven desde la raíz del repositorio.

Las cantidades enteras son el estado actual del esquema, no una resolución de P-09. Antes de pruebas con limpieza, verificar host y nombre exacto de una base desechable; contener la palabra test no es garantía suficiente. Analizar la creación concurrente de saldos inexistentes: FOR UPDATE no bloquea una fila que todavía no existe.

Aplicar la referencia dentro del alcance autorizado. Las aprobaciones ya dadas siguen vigentes; solicitar únicamente decisiones realmente faltantes. Entregar archivos afectados, evidencia, comprobaciones ejecutadas y limitaciones.

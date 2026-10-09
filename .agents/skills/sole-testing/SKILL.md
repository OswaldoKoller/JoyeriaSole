---
name: sole-testing
description: Diseñar y ejecutar Vitest, integración PostgreSQL y E2E de Joyería Sole.
---

# Diseñar y ejecutar Vitest, integración PostgreSQL y E2E de Joyería Sole.

Leer [AGENTS.md](../../../AGENTS.md) y la [referencia del área](../../../.claude/skills/testing/SKILL.md). Las rutas de código que esa referencia presenta se resuelven desde la raíz del repositorio.

npm run test:unit ejecuta unitarias API y componentes web. Revisar scripts antes de ejecutar. Usar npm run qa para check y E2E con PostgreSQL efímero. Playwright exige TEST_DATABASE_URL y servidores propios; no reutilizar la BD de desarrollo. No reintentar fallos hasta ocultarlos: conservar primera evidencia y diagnosticar.

Aplicar la referencia dentro del alcance autorizado. Las aprobaciones ya dadas siguen vigentes; solicitar únicamente decisiones realmente faltantes. Entregar archivos afectados, evidencia, comprobaciones ejecutadas y limitaciones.

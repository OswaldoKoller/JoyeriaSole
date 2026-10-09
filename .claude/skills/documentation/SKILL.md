---
name: documentation
description: Qué documentar y dónde en Joyería Sole — mapa de documentos, ADRs, decisiones pendientes, CHANGELOG y estilo. Usar al cerrar cualquier cambio que afecte comportamiento, modelo de datos, API, seguridad o despliegue.
---

# Documentación

## Qué actualizar según el cambio

| Cambio                               | Actualizar                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Endpoint nuevo/modificado            | `docs/api/API.md` (+ `requests.http` opcional)                                       |
| Modelo de datos                      | `docs/database/DATABASE.md`                                                          |
| Regla de negocio aprobada            | `docs/business/DOMINIO.md` + marcar 🟢 en `PENDIENTES.md` (con fecha y quién aprobó) |
| Regla no definida descubierta        | Nueva fila 🟡 en `docs/business/PENDIENTES.md` (P-siguiente)                         |
| Decisión estructural                 | Nuevo ADR en `docs/decisions/` + índice `docs/decisions/README.md`                   |
| Seguridad                            | `docs/security/SECURITY.md`                                                          |
| Infraestructura / variables          | `docs/deployment/*`, `.env.example`                                                  |
| Comando o flujo de desarrollo        | `docs/DEVELOPMENT.md`, `README.md` si es principal                                   |
| Cambio visible para usuarios/equipo  | `CHANGELOG.md` → `[Sin publicar]` (Agregado/Cambiado/Corregido/Eliminado/Seguridad)  |
| Regla que Claude debe seguir siempre | Proponer cambio a `CLAUDE.md` (requiere aprobación del usuario)                      |

## ADR

Copiar `docs/decisions/TEMPLATE.md` → `ADR-NNN-titulo-kebab.md`. Contexto, decisión, alternativas,
consecuencias. Un ADR aceptado no se edita: se reemplaza por otro.

## Decisiones pendientes

Formato de fila: ID · decisión (como pregunta para el cliente) · estado · qué está preparado hoy ·
alternativas. Lenguaje comprensible para el dueño del negocio.

## Estilo

- Español, directo, con ejemplos concretos del negocio (anillos, cadenas, tallas).
- Enlazar en lugar de duplicar. Rutas relativas.
- Tablas para comparaciones; bloques de código para comandos (verificados).
- Marcar explícitamente lo no confirmado: **PENDIENTE (P-xx)**.
- `npm run format` antes de terminar.

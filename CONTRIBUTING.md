# Cómo contribuir

## Ramas

| Rama                          | Uso                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `main`                        | Producción. Solo recibe merges desde `develop` (o `hotfix/*`). Protegida. Cada merge despliega. |
| `develop`                     | Integración. Base de todo trabajo nuevo. Protegida: requiere CI verde.                          |
| `feature/<desc>`              | Funcionalidad nueva, desde `develop`. Ej.: `feature/catalogo-variantes`.                        |
| `fix/<desc>`                  | Corrección no urgente, desde `develop`.                                                         |
| `hotfix/<desc>`               | Corrección urgente en producción, desde `main`; se mergea a `main` y a `develop`.               |
| `docs/<desc>`, `chore/<desc>` | Documentación o mantenimiento.                                                                  |

Protección recomendada en GitHub para `main` y `develop`: PR obligatorio, CI (`quality`) en verde,
sin push directo, historial lineal (squash o rebase).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/es/), en español, en imperativo:

```
feat(catalog): agregar creación de variantes por combinación de ejes
fix(inventory): evitar condición de carrera al actualizar saldos
docs(adr): registrar decisión de prorrateo de costos
chore(deps): actualizar prisma a 7.11
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`.
Ámbitos sugeridos: `api`, `web`, `shared`, `db`, `auth`, `catalog`, `suppliers`, `stock-entries`,
`inventory`, `counts`, `audit`, `deps`, `adr`.

**Commits pequeños y trazables**: un cambio lógico por commit. Una migración va en el mismo commit
que el código que la necesita.

## Pull requests

- Hacia `develop`, completando la plantilla.
- `npm run check` debe pasar en local antes de abrir el PR.
- Un PR = una funcionalidad o corrección. Si supera ~400 líneas (sin contar migraciones ni lockfile),
  dividirlo.
- Revisar especialmente: permisos en endpoints nuevos, auditoría, movimientos de stock, migraciones.

## Hooks locales (Husky)

- `pre-commit`: ESLint + Prettier sobre los archivos en stage (lint-staged).
- `pre-push`: typecheck.

No usar `--no-verify` salvo emergencia justificada.

## Versionado y CHANGELOG

[SemVer](https://semver.org/lang/es/). Registrar cambios relevantes en `CHANGELOG.md` en la sección
`[Sin publicar]`; al liberar a producción se mueve a una versión con fecha y se crea el tag `vX.Y.Z`.

## Reglas de negocio

No implementar reglas marcadas como **PENDIENTE** en `docs/business/PENDIENTES.md` sin aprobación
registrada. Ante una regla nueva no documentada: preguntar, documentarla como pendiente y no asumir.

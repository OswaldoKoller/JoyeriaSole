---
name: git-workflow
description: Flujo Git del proyecto Joyería Sole — ramas main/develop/feature/fix/hotfix, Conventional Commits en español, commits pequeños, PRs y hooks. Usar al crear ramas, commits o pull requests.
---

# Flujo de Git

Referencia: `CONTRIBUTING.md`.

## Reglas para Claude

- **No hacer commit ni push salvo que el usuario lo pida explícitamente.**
- Nunca `--no-verify`, nunca `push --force` a `main`/`develop`, nunca reescribir historial publicado.
- Nunca commitear `.env`, dumps, backups, `apps/api/src/generated/`.
- Antes de commitear: `npm run check` (o al menos lint + typecheck + tests afectados).

## Ramas

```
main      ← producción (solo merges desde develop o hotfix/*)
develop   ← integración (base de trabajo)
feature/<desc-corta>   fix/<desc>   hotfix/<desc>   docs/<desc>   chore/<desc>
```

```bash
git switch develop && git pull
git switch -c feature/catalogo-variantes
```

## Commits

Conventional Commits en español, imperativo, ≤ 72 caracteres en el título:

```
feat(catalog): agregar endpoint de creación de variantes
fix(inventory): bloquear fila de saldo al registrar movimiento
test(stock-entries): cubrir confirmación duplicada
docs(pendientes): registrar decisión sobre stock negativo
```

- Un cambio lógico por commit; la migración junto al código que la usa.
- Cuerpo opcional explicando el **porqué** si no es obvio.
- Terminar con la línea de co-autoría que indique el entorno, si corresponde.

## Pull request

- Hacia `develop`. Título en formato Conventional Commit.
- Completar `.github/pull_request_template.md` (checklist de permisos, auditoría, migraciones, pendientes).
- CI verde obligatorio (lint, formato, tipos, migraciones desde cero, tests, build, imagen Docker).

## Hooks

- `pre-commit`: lint-staged (ESLint --fix + Prettier sobre archivos en stage).
- `pre-push`: `npm run typecheck`.

# Guía de desarrollo

Para verificar cambios de Fase 1, usar `npm run qa`: ejecuta check y E2E contra
PostgreSQL efímero con credenciales sintéticas. Docker debe estar iniciado y Chromium
instalado (`npx playwright install chromium`). Ver [estrategia de pruebas](testing/TESTING.md).
`npm run test:e2e` es el comando interno y requiere entorno de pruebas explícito;
para ejecutar solo navegador con preparación automática usar `npm run qa:e2e`.

## Requisitos

- Node.js ≥ 22.12 (ver `.nvmrc`) y npm ≥ 10
- Docker Desktop (para PostgreSQL de desarrollo)
- Git
- VS Code con las extensiones recomendadas (se sugieren al abrir el proyecto)

## Primera vez

```bash
git clone <repo> && cd joyeriaSole
cp .env.example .env            # completar: POSTGRES_PASSWORD (y en DATABASE_URL/TEST_DATABASE_URL),
                                # AUTH_SECRET, SEED_ADMIN_PASSWORD
npm install                     # instala todo y genera el cliente Prisma
npm run db:up                   # PostgreSQL 18 en Docker (puerto 5434; crea joyeria_dev y joyeria_test)
npm run db:deploy               # aplica migraciones
npm run db:seed                 # permisos, roles, admin inicial, atributos
npm run dev                     # API :3000 + Web :5173  → http://localhost:5173
```

Generar `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> Los puertos 5432/5433 suelen estar ocupados por instalaciones locales de PostgreSQL; por eso el
> contenedor usa **5434**. Se cambia con `POSTGRES_PORT` (y las URLs) en `.env`.

## Comandos

| Comando                                               | Qué hace                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                                         | Levanta la BD (si no está) + API con recarga + Vite                                |
| `npm run dev:api` / `dev:web`                         | Solo uno de los dos                                                                |
| `npm run build`                                       | Compila API (tsup) y web (Vite)                                                    |
| `npm start`                                           | Ejecuta la API compilada (`WEB_DIST_DIR=apps/web/dist` para servir también la web) |
| `npm run lint` / `lint:fix`                           | ESLint (0 advertencias permitidas)                                                 |
| `npm run format` / `format:check`                     | Prettier                                                                           |
| `npm run typecheck`                                   | TypeScript en todos los paquetes                                                   |
| `npm test`                                            | Unitarias + integración (API) + componentes (web)                                  |
| `npm run test:unit` / `test:integration` / `test:e2e` | Por nivel                                                                          |
| `npm run check`                                       | Todo lo que corre el CI: lint, formato, tipos, tests, build                        |
| `npm run db:up` / `db:down`                           | Inicia / detiene PostgreSQL (los datos persisten en el volumen)                    |
| `npm run db:migrate`                                  | Crea y aplica una migración desde `schema.prisma`                                  |
| `npm run db:deploy`                                   | Aplica migraciones pendientes sin crear nuevas                                     |
| `npm run db:seed`                                     | Seed idempotente                                                                   |
| `npm run db:reset`                                    | ⚠ Borra la BD de desarrollo y re-aplica migraciones (pide confirmación)            |
| `npm run db:studio`                                   | Prisma Studio (explorar datos)                                                     |

## Flujo para un cambio

1. `git switch develop && git pull && git switch -c feature/<descripcion-corta>`
2. Si cambia el esquema: editar `schema.prisma` → `npm run db:migrate -- --name <nombre>` → revisar el SQL.
3. Implementar siguiendo `CLAUDE.md` y las skills en `.claude/skills/`.
4. Tests del cambio. `npm run check`.
5. Commits pequeños con Conventional Commits (el hook `pre-commit` corre lint + prettier en lo modificado).
6. PR hacia `develop` con la plantilla completa.

## Depuración

- VS Code → _Run and Debug_ → "API: depurar (tsx)" o "API: depurar test actual".
- Peticiones manuales: `requests.http` (extensión REST Client).
- Cada respuesta trae `x-request-id`; buscar ese id en la consola de la API.

## Problemas comunes

| Síntoma                                      | Solución                                                             |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `Variables de entorno inválidas` al arrancar | Falta o es inválida una variable en `.env` (el mensaje indica cuál). |
| `Can't reach database server`                | `npm run db:up`; verificar Docker Desktop iniciado y el puerto.      |
| Tipos de Prisma desactualizados              | `npm run db:generate`                                                |
| Puerto 3000 o 5173 ocupado                   | Cerrar el proceso anterior o cambiar `API_PORT` / puerto de Vite.    |
| E2E: navegador no encontrado                 | `npx playwright install chromium`                                    |

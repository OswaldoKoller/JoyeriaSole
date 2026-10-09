# Estrategia de pruebas

## Ejecución aislada recomendada

Con Docker Desktop iniciado, dependencias instaladas y Chromium disponible:

```bash
npm run qa       # PostgreSQL efímero + check + seed sintético + E2E
npm run qa:e2e   # PostgreSQL efímero + migraciones + seed sintético + E2E
```

El runner crea un contenedor exclusivo con puerto dinámico ligado a 127.0.0.1,
credenciales aleatorias y base joyeria_test; al finalizar lo detiene y elimina.
No utiliza el volumen de desarrollo ni el administrador de .env. Si se termina el
proceso a la fuerza, comprobar contenedores con etiqueta joyeria.qa=ephemeral y
detener únicamente el de esa ejecución. Las trazas de Playwright pueden contener
datos sintéticos de login: siguen excluidas de Git.

E2E usa API :3001 y web :5174; falla si ya hay servidores en esos puertos. No los
reutiliza. TEST_DATABASE_URL, AUTH_SECRET y SEED_ADMIN_* deben estar definidos
para ejecución manual; el runner los proporciona y aplica el seed previamente.
API_PROXY_TARGET configura el proxy de Vite en QA; desarrollo mantiene :3000.

| Nivel             | Herramienta                                 | Ubicación                    | Qué cubre                                                                                                     | Comando                    |
| ----------------- | ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Unitarias (API)   | Vitest                                      | `apps/api/test/unit/`        | Lógica pura: errores, contraseñas, tokens, configuración. Futuro: cálculos de costos, transiciones de estado. | `npm run test:unit`        |
| Integración (API) | Vitest + Fastify `inject` + PostgreSQL real | `apps/api/test/integration/` | Endpoints completos, auth, permisos, transacciones, restricciones de BD.                                      | `npm run test:integration` |
| Componentes (web) | Vitest + Testing Library + jsdom            | `apps/web/src/**/*.test.tsx` | Comportamiento de componentes y páginas (fetch simulado).                                                     | `npm test -w @joyeria/web` |
| E2E               | Playwright (Chromium)                       | `apps/web/e2e/`              | Flujos completos con servidores exclusivos y BD de pruebas.                                                   | `npm run test:e2e`         |

`npm test` ejecuta unitarias + integración + componentes. E2E se ejecuta aparte (más lento).

La suite web usa threads con un worker: en Windows se observó un timeout de arranque
con forks antes de ejecutar casos. Se conservan aserciones y plazos de las pruebas.

## Base de datos de pruebas

- Base separada `joyeria_test` (creada automáticamente por `scripts/db-init/` en Docker).
- `TEST_DATABASE_URL` exige protocolo PostgreSQL, host localhost/127.0.0.1,
  nombre exacto joyeria_test y schema public. No admite otros parámetros de conexión.
  Esta protección no sustituye verificar que la instancia sea desechable: preferir npm run qa.
- `global-setup.ts` aplica las migraciones una vez; cada archivo vacía las tablas con `resetDatabase()`.
- Los archivos de integración corren en serie (comparten la base).

## Helpers

- `buildTestApp(configure?)` — app real con entorno de test; `configure` permite registrar rutas de prueba.
- `login(app, email, password)` — devuelve la cabecera `cookie` lista para `inject`.
- `createTestUser(prisma, { permissions })` — usuario con un rol ad-hoc con exactamente esos permisos.

## Qué debe probarse en la Fase 1 (obligatorio)

- Cada endpoint: 401 sin sesión, 403 sin permiso, 400 con datos inválidos, caso feliz.
- **Inventario**: todo cambio de stock genera movimiento; saldo = suma de movimientos; concurrencia
  (dos operaciones simultáneas sobre la misma variante no pierden actualizaciones).
- **Ingresos**: crear/editar borrador no cambia stock; confirmar sí, una sola vez; cancelar confirmado falla.
- **Inventario físico**: snapshot correcto; aprobación genera ajustes exactos por diferencia.
- Auditoría escrita en la misma transacción (si la operación falla, no queda auditoría huérfana).

## E2E — primera vez

```bash
npx playwright install chromium   # descarga el navegador (una vez por equipo)
npm run qa:e2e                   # crea BD efímera y servidores exclusivos
```

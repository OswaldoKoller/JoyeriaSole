# Estrategia de pruebas

| Nivel             | Herramienta                                 | Ubicación                    | Qué cubre                                                                                                     | Comando                    |
| ----------------- | ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Unitarias (API)   | Vitest                                      | `apps/api/test/unit/`        | Lógica pura: errores, contraseñas, tokens, configuración. Futuro: cálculos de costos, transiciones de estado. | `npm run test:unit`        |
| Integración (API) | Vitest + Fastify `inject` + PostgreSQL real | `apps/api/test/integration/` | Endpoints completos, auth, permisos, transacciones, restricciones de BD.                                      | `npm run test:integration` |
| Componentes (web) | Vitest + Testing Library + jsdom            | `apps/web/src/**/*.test.tsx` | Comportamiento de componentes y páginas (fetch simulado).                                                     | `npm test -w @joyeria/web` |
| E2E               | Playwright (Chromium)                       | `apps/web/e2e/`              | Flujos completos en navegador contra API + BD de desarrollo.                                                  | `npm run test:e2e`         |

`npm test` ejecuta unitarias + integración + componentes. E2E se ejecuta aparte (más lento).

## Base de datos de pruebas

- Base separada `joyeria_test` (creada automáticamente por `scripts/db-init/` en Docker).
- `TEST_DATABASE_URL` **debe** contener "test" en el nombre de la base; si no, la suite aborta
  (protección contra borrar datos reales).
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
npm run test:e2e                  # levanta API y web automáticamente si no están corriendo
```

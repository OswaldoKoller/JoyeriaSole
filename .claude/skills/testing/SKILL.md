---
name: testing
description: Cómo escribir y ejecutar pruebas en Joyería Sole — Vitest unitario e integración con PostgreSQL real, Testing Library para componentes, Playwright E2E; helpers disponibles y casos obligatorios. Usar al agregar funcionalidad o diagnosticar tests.
---

# Pruebas

Referencia: `docs/testing/TESTING.md`.

## Comandos

```bash
npm test                         # todo menos E2E
npm run test:unit                # API unitarias (sin BD)
npm run test:integration         # API con BD joyeria_test (requiere npm run db:up)
npm test -w @joyeria/web         # componentes
npm run test:e2e                 # Playwright (npx playwright install chromium una vez)
cd apps/api && npx vitest run test/integration/auth.test.ts   # un archivo
```

## Dónde

| Tipo        | Ubicación                             | Cuándo                                                 |
| ----------- | ------------------------------------- | ------------------------------------------------------ |
| Unitario    | `apps/api/test/unit/*.test.ts`        | Funciones puras (cálculos, validaciones, transiciones) |
| Integración | `apps/api/test/integration/*.test.ts` | Endpoints, transacciones, efectos en BD                |
| Componente  | `apps/web/src/**/*.test.tsx`          | Comportamiento de UI                                   |
| E2E         | `apps/web/e2e/*.spec.ts`              | Flujos críticos completos (login, ingreso, conteo)     |

## Helpers (apps/api/test/helpers)

```ts
const app = await buildTestApp((a) => {
  /* registrar rutas de prueba opcionales */
});
await resetDatabase(app.prisma); // TRUNCATE de todo (beforeEach)
const { user, password } = await createTestUser(app.prisma, { permissions: [PERMISSIONS.X] });
const { cookie } = await login(app, user.email, password);
const res = await app.inject({ method: 'GET', url: '/api/v1/...', headers: { cookie } });
```

- `TEST_DATABASE_URL` debe contener "test" (si no, la suite aborta).
- Los archivos de integración corren en serie; cada uno limpia la BD en `beforeEach`.
- El seed **no** se ejecuta en tests: crear los datos necesarios en cada test.

## Casos obligatorios

Por endpoint: 401 sin sesión · 403 sin permiso · 400 inválido · caso feliz · 404/409/422 si aplica.
Por operación de stock: movimiento creado con `balance_before/after` correctos · saldo actualizado ·
auditoría creada · rollback completo si algo falla · no se puede repetir (confirmar dos veces).

## Estilo

- Nombre del test = regla de negocio en español: `it('no incrementa el stock al guardar un ingreso en borrador')`.
- Arrange / act / assert claros; un comportamiento por test.
- Nada de `sleep`; nada de depender del orden entre tests.
- No probar reglas PENDIENTES como si estuvieran aprobadas.

## Qué cambia

<!-- Descripción breve y motivo. Enlazar issue/decisión si existe. -->

## Tipo

- [ ] feat · [ ] fix · [ ] refactor · [ ] docs · [ ] chore · [ ] test

## Checklist

- [ ] `npm run check` pasa en local (lint, formato, tipos, tests, build)
- [ ] Si cambia el esquema: migración incluida y `docs/database/DATABASE.md` actualizado
- [ ] Si cambia stock/costos/precios: genera movimiento y/o auditoría
- [ ] Si agrega endpoints: protegidos con `requirePermission` y validados con Zod
- [ ] No introduce reglas de negocio marcadas como PENDIENTE sin aprobación
- [ ] Sin secretos ni credenciales en el código
- [ ] CHANGELOG actualizado (si aplica)

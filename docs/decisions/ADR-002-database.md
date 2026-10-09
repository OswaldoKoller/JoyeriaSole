# ADR-002: PostgreSQL + Prisma

- **Estado:** Aceptado
- **Fecha:** 2026-10-06

## Contexto

El inventario exige transacciones (movimiento + saldo + auditoría juntos), integridad referencial,
restricciones fuertes y una oferta administrada con backups para producción.

## Decisión

**PostgreSQL 18** como base de datos y **Prisma 7** (generador `prisma-client`, adapter
`@prisma/adapter-pg`) como ORM y herramienta de migraciones. Las reglas que Prisma no expresa (CHECK,
triggers append-only) se agregan como SQL en las migraciones.

## Alternativas consideradas

- Drizzle ORM: más cercano a SQL y ligero; Prisma ofrece migraciones, Studio y documentación más
  maduras para un equipo pequeño.
- MySQL: CHECK y JSON menos expresivos; menos opciones administradas con PITR.
- SQLite: no apto para acceso concurrente desde Internet.

## Consecuencias

- IDs UUID v7, dinero en `numeric`, fechas `timestamptz`.
- El cliente Prisma se genera (`npm run db:generate`) y no se versiona.
- El CLI de Prisma 7 arrastra dependencias con avisos de `npm audit` no explotables en este uso
  (ver `docs/security/SECURITY.md`).

-- =============================================================================
-- D3 · Quitar el permiso TRUNCATE al usuario de la aplicación (PRODUCCIÓN).
--
-- Los triggers append-only de inventory_movements y audit_logs son por fila: TRUNCATE no los
-- dispara. Por eso, en producción, el rol con el que corre la aplicación no debe poder ejecutar
-- TRUNCATE sobre ninguna tabla. No se hace con un trigger BEFORE TRUNCATE (rompería resetDatabase de
-- las pruebas) ni en una migración (las migraciones también corren en la base de pruebas).
--
-- Lo ejecuta el CMD del Dockerfile en cada arranque, después de `prisma migrate deploy` y con el
-- mismo DATABASE_URL (`npx prisma db execute --file prisma/privileges/revoke-app-truncate.sql`).
-- Es idempotente y no toca datos. Se aplica al rol conectado (current_user):
--   1. revoca TRUNCATE en todas las tablas del esquema public de las que es dueño (en producción, todas:
--      la aplicación migra y opera con el mismo rol); si hay tablas de otro dueño, avisa con WARNING;
--   2. revoca TRUNCATE en los privilegios por defecto del rol, para que las tablas que creen las
--      migraciones futuras nazcan sin él (se vuelve a aplicar en cada arranque de todos modos).
--
-- Límites (ver docs/deployment/DEPLOYMENT.md, «Rol de la base de datos sin TRUNCATE»):
--   * Si el rol es SUPERUSUARIO los privilegios no se comprueban y esto no tiene efecto: se emite un
--     WARNING. Producción no debe conectarse como superusuario.
--   * Si el rol es el DUEÑO de las tablas, podría volver a concederse el permiso con GRANT; la medida
--     evita un TRUNCATE accidental o inyectado, no a quien ya controla la credencial del dueño.
--
-- Es una sola sentencia (bloque DO) para poder ejecutarla también desde una prueba de integración
-- dentro de una transacción que se revierte.
-- =============================================================================
DO $$
DECLARE
  app_role text := current_user;
  app_oid oid := (SELECT oid FROM pg_roles WHERE rolname = current_user);
  tbl regclass;
  foreign_tables integer;
BEGIN
  IF (SELECT rolsuper FROM pg_roles WHERE oid = app_oid) THEN
    RAISE WARNING 'El rol % es superusuario: revocar TRUNCATE no tiene efecto. En producción la aplicación debe usar un rol sin privilegios de superusuario.', app_role;
  END IF;

  -- Solo las tablas de las que el rol es dueño: REVOKE quita únicamente lo que concedió quien lo
  -- ejecuta (sobre tablas ajenas no tendría efecto o fallaría por falta de permisos).
  FOR tbl IN
    SELECT c.oid::regclass FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relowner = app_oid
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM %I', tbl, app_role);
  END LOOP;

  SELECT count(*) INTO foreign_tables FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relowner <> app_oid;
  IF foreign_tables > 0 THEN
    RAISE WARNING '% tablas de public no pertenecen al rol %: su dueño debe revocarle TRUNCATE.', foreign_tables, app_role;
  END IF;

  -- Sin IN SCHEMA: los privilegios por defecto por esquema solo pueden AGREGAR permisos.
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE TRUNCATE ON TABLES FROM %I',
                 app_role, app_role);
END $$;

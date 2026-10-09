#!/bin/sh
# Se ejecuta una sola vez al crear el volumen de PostgreSQL.
# Crea la base usada por las pruebas de integración.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE joyeria_test OWNER "$POSTGRES_USER";
EOSQL

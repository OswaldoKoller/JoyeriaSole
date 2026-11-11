#!/usr/bin/env bash
# Prueba de ARRANQUE de la imagen Docker de producción (smoke test).
#
#   bash scripts/smoke-image.sh [imagen]        (por defecto: joyeria-sole:ci)
#
# Qué demuestra, con la imagen ya construida y un PostgreSQL EFÍMERO propio:
#   1. El contenedor arranca con su CMD real: `prisma migrate deploy` desde una base vacía + servidor.
#   2. GET /api/v1/health responde 200 (con tiempo máximo acotado) y la SPA se sirve en `/`.
#   3. El seed de producción compilado (`node dist/seed.js`, paso 6 de DEPLOYMENT.md) corre dentro de la
#      imagen, dos veces (es idempotente), con las variables SEED_ADMIN_*.
#   4. El administrador sembrado inicia sesión (200) y una contraseña incorrecta se rechaza (401).
#   5. El CMD quitó el permiso TRUNCATE al rol de la aplicación en todas las tablas (D3).
#
# Es el MISMO script que ejecuta el CI (job `docker`) y el que se usa en local: lo validado aquí es lo que
# corre en GitHub Actions. No toca ningún otro contenedor: crea red y contenedores con prefijo `smoke-` y
# nombre único, y al terminar borra SOLO esos. Las credenciales son efímeras (openssl rand), no se imprimen
# y no se pasan por la línea de comandos de docker (se usan `--env NOMBRE` heredados del entorno).
set -Eeuo pipefail
set +x

IMAGE="${1:-joyeria-sole:ci}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:18-alpine}"

SUFFIX="$(openssl rand -hex 4)"
NET="smoke-net-${SUFFIX}"
DB="smoke-db-${SUFFIX}"
APP="smoke-app-${SUFFIX}"

# Secretos efímeros: solo existen en el entorno de este proceso.
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n=')"
SEED_ADMIN_EMAIL="smoke-admin-${SUFFIX}@example.invalid"
SEED_ADMIN_NAME="Admin Smoke"
SEED_ADMIN_PASSWORD="$(openssl rand -hex 16)"
WRONG_PASSWORD="$(openssl rand -hex 16)"
DATABASE_URL="postgresql://joyeria:${POSTGRES_PASSWORD}@${DB}:5432/joyeria_smoke?schema=public"
export POSTGRES_PASSWORD AUTH_SECRET SEED_ADMIN_EMAIL SEED_ADMIN_NAME SEED_ADMIN_PASSWORD DATABASE_URL

# En GitHub Actions, enmascarar por si algún valor llegara a un log.
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "::add-mask::${POSTGRES_PASSWORD}"
  echo "::add-mask::${AUTH_SECRET}"
  echo "::add-mask::${SEED_ADMIN_PASSWORD}"
  echo "::add-mask::${WRONG_PASSWORD}"
fi

step() { printf '\n== %s\n' "$*"; }
fail() { printf 'FALLO: %s\n' "$*" >&2; exit 1; }

cleanup() {
  status=$?
  if [ "$status" -ne 0 ] && docker inspect "$APP" >/dev/null 2>&1; then
    echo "--- registros de la aplicación (últimas 60 líneas) ---" >&2
    docker logs --tail 60 "$APP" >&2 2>&1 || true
  fi
  # Solo se borra lo creado por esta ejecución (nombres con sufijo único).
  docker rm -f "$APP" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

START_TS="$(date +%s)"

step "Red y PostgreSQL efímeros (${NET}, ${DB})"
docker network create "$NET" >/dev/null
docker run --detach --name "$DB" --network "$NET" \
  --env POSTGRES_PASSWORD --env POSTGRES_USER=joyeria --env POSTGRES_DB=joyeria_smoke \
  "$POSTGRES_IMAGE" >/dev/null
# Por TCP (-h 127.0.0.1): durante la inicialización la imagen de postgres levanta un servidor temporal solo
# por socket y luego lo reinicia; comprobar por TCP evita dar por lista esa instancia transitoria.
db_ready=0
for _ in $(seq 1 60); do
  if docker exec "$DB" pg_isready -h 127.0.0.1 -U joyeria -d joyeria_smoke >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 1
done
[ "$db_ready" = "1" ] || fail "PostgreSQL no quedó listo en 60 s"

step "Arranque de la imagen ${IMAGE} (CMD real: migrate deploy + servidor)"
docker run --detach --name "$APP" --network "$NET" \
  --publish 127.0.0.1::3000 \
  --env DATABASE_URL --env AUTH_SECRET \
  --env NODE_ENV=production --env LOG_LEVEL=info \
  --env COOKIE_SECURE=false --env TRUST_PROXY_HOPS=0 \
  --env CORS_ORIGIN=http://localhost:3000 --env FRONTEND_URL=http://localhost:3000 \
  "$IMAGE" >/dev/null
HOST_PORT="$(docker port "$APP" 3000/tcp | head -n 1 | sed 's/.*://')"
BASE_URL="http://127.0.0.1:${HOST_PORT}"

step "Esperar GET /api/v1/health = 200 (máximo ${HEALTH_TIMEOUT_SECONDS} s)"
ok=0
for _ in $(seq 1 "$HEALTH_TIMEOUT_SECONDS"); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "${BASE_URL}/api/v1/health" || true)"
  if [ "$code" = "200" ]; then ok=1; break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$APP")" != "true" ]; then fail "el contenedor se detuvo antes de responder"; fi
  sleep 1
done
[ "$ok" = "1" ] || fail "/api/v1/health no respondió 200 en ${HEALTH_TIMEOUT_SECONDS} s (último: ${code:-sin respuesta})"
echo "health: 200"

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${BASE_URL}/")"
[ "$code" = "200" ] || fail "la SPA no se sirve en / (HTTP ${code})"
echo "SPA en /: 200"

step "El rol de la aplicación no tiene TRUNCATE (D3: CMD real, prisma/privileges/revoke-app-truncate.sql)"
# Se lee la ACL efectiva (aclexplode): en esta base efímera el rol es superusuario y has_table_privilege
# siempre devolvería verdadero, pero la ACL demuestra que el CMD quitó el permiso.
truncate_grants="$(docker exec "$DB" psql -U joyeria -d joyeria_smoke -tAc "
  SELECT count(*) FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    AND a.privilege_type = 'TRUNCATE' AND a.grantee = 'joyeria'::regrole")"
[ "$truncate_grants" = "0" ] || fail "el rol de la aplicación conserva TRUNCATE en ${truncate_grants} tablas"
echo "sin TRUNCATE en ninguna tabla"

step "Seed de producción compilado dentro de la imagen: node dist/seed.js (1.ª y 2.ª ejecución)"
for run in 1 2; do
  echo "-- ejecución ${run}"
  docker exec --env DATABASE_URL --env SEED_ADMIN_EMAIL --env SEED_ADMIN_NAME --env SEED_ADMIN_PASSWORD \
    "$APP" node dist/seed.js
done

step "Inicio de sesión del administrador sembrado"
login() {
  # La contraseña viaja por stdin (printf es interno del shell): no aparece en la lista de procesos.
  printf '{"email":"%s","password":"%s"}' "$SEED_ADMIN_EMAIL" "$1" |
    curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      -X POST -H 'content-type: application/json' --data-binary @- "${BASE_URL}/api/v1/auth/login"
}
code="$(login "$SEED_ADMIN_PASSWORD")"
[ "$code" = "200" ] || fail "el login del administrador sembrado devolvió HTTP ${code} (esperado 200)"
echo "login correcto: 200"
code="$(login "$WRONG_PASSWORD")"
[ "$code" = "401" ] || fail "una contraseña incorrecta devolvió HTTP ${code} (esperado 401)"
echo "login con clave incorrecta: 401"

printf '\nOK: arranque, seed compilado y login verificados en %s s\n' "$(( $(date +%s) - START_TS ))"

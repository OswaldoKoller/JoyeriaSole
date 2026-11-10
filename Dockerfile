# syntax=docker/dockerfile:1
# =============================================================================
# Imagen de PRODUCCIÓN: una sola imagen con la API que además sirve el frontend compilado.
# (En desarrollo NO se usa: ver docker-compose.yml, que solo levanta PostgreSQL.)
# =============================================================================

ARG NODE_VERSION=22

# ---- 1. Dependencias (todas, para compilar) ----------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# El postinstall de la API ejecuta `prisma generate` y descarga el schema engine: necesita el esquema.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci

# ---- 2. Compilación ----------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w @joyeria/api && npm run build -w @joyeria/web \
    && find apps/api/dist apps/web/dist -name '*.map' -delete

# ---- 3. Dependencias de producción ------------------------------------------
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci --omit=dev -w @joyeria/api && npm cache clean --force

# ---- 4. Runtime --------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    WEB_DIST_DIR=/app/web
WORKDIR /app/apps/api

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
# dist/ incluye server.js (la API) y seed.js (seed ESTRUCTURAL compilado: `node dist/seed.js`).
# La imagen no trae tsx ni el código fuente, así que `npx prisma db seed` no funciona aquí.
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts /app/apps/api/package.json ./
COPY --from=build --chown=node:node /app/apps/web/dist /app/web

# Nunca ejecutar como root.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1

# Aplica migraciones pendientes y arranca. `migrate deploy` es idempotente y no destructivo.
# `exec` reemplaza al shell por Node: SIGTERM llega a la API y el apagado ordenado funciona.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]

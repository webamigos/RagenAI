FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NOTE: the Prisma client is generated from ../../prisma/schema.prisma (the
# monorepo's single shared schema, see docs/adrs/21-monorepo-and-api-decoupling.md)
# into src/generated/prisma, and `nest build` copies it into dist/generated via
# nest-cli.json's `assets` config. This build stage currently assumes the build
# context already contains a generated src/generated/prisma (e.g. produced by a
# monorepo-root `npx prisma generate` before `docker build` runs, or this
# Dockerfile/COPY context needs to move to the monorepo root) — this is not yet
# wired up for a standalone `docker build` from apps/api/. Fixing the build
# context/CI step is tracked separately; do not reintroduce a local
# apps/api/prisma/schema.prisma to work around it.
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
# Railway uses IPv6 private networking; force IPv6-first DNS resolution
ENV NODE_OPTIONS="--dns-result-order=ipv6first"
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]

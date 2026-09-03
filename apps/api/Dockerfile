FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma.config.ts prisma.config.ts
# --ignore-scripts skips the root project's `prepare` script (husky, which
# needs a .git directory that isn't in the build context at this stage) —
# same reasoning as apps/admin/Dockerfile. That also skips native-module
# postinstall builds, so rebuild the one apps/api actually needs at
# runtime (bcrypt, used by ThreadSharingService for public-link password
# hashing) explicitly, same pattern as admin's `npm rebuild esbuild`.
RUN npm ci --ignore-scripts && npm rebuild bcrypt

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client is generated from the monorepo's single shared schema
# (../../prisma/schema.prisma, see docs/adrs/21-monorepo-and-api-decoupling.md)
# via a second `generator apiClient` block — one `prisma generate` here
# produces both ragen-app's and apps/api's clients.
RUN npx prisma generate
# Build the workspace packages before apps/api, and build apps/api *through*
# turbo so its `dependsOn: ["^build"]` is what orders them.
#
# Neither happened before, and the image could not be built from a clean
# checkout because of it: `npm ci --ignore-scripts` above skips each package's
# `prepare` hook (which is what runs its build), `.dockerignore` excludes
# `**/dist` so a locally-built one is never copied in, and every package
# resolves through `main: ./dist/index.js`. `nest build` then failed with
# "Cannot find module '@ragenai/…'" for each one. It succeeded on a developer's
# machine only when their host happened to have the artifacts, which Docker
# never copied anyway.
RUN npx turbo run build --filter=@webamigos/ragen-api
# Drop devDependencies from the shared root node_modules before it's
# copied into the production image below. `npm prune` (not a separate
# `npm ci --omit=dev`) operates on the exact tree `npm run build` just
# used, so there's no risk of a hoisting mismatch between what built
# apps/api and what ships with it.
RUN npm prune --omit=dev

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
# Railway uses IPv6 private networking; force IPv6-first DNS resolution
ENV NODE_OPTIONS="--dns-result-order=ipv6first"
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
# node_modules/@ragenai/* are symlinks into packages/, so without the targets
# every one of them dangles and the container cannot start.
COPY --from=build /app/packages ./packages

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

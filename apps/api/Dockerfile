FROM node:22-alpine AS base

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
RUN cd apps/api && npm run build
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

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

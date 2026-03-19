FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma.config.ts prisma.config.ts
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY . .
RUN npx prisma generate

ENV BETTER_AUTH_SECRET="build-placeholder-secret-min-32-chars!" \
    BETTER_AUTH_URL="http://localhost:3200" \
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    GOOGLE_CLIENT_ID="dummy" \
    GOOGLE_CLIENT_SECRET="dummy" \
    DISABLE_OTEL="1"

RUN cd apps/admin && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone output preserves monorepo structure: server.js is at apps/admin/
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs

EXPOSE 3200
ENV PORT=3200
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/admin/server.js"]

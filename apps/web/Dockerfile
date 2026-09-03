FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/rag-core/package.json ./packages/rag-core/package.json
COPY packages/storage/package.json ./packages/storage/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma.config.ts prisma.config.ts
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Build-time NEXT_PUBLIC_* flags. Next.js inlines `process.env.NEXT_PUBLIC_*`
# at build time, so these must be passed as build args, not runtime env vars.
# Railway: declare matching variables under "Build" args on the service.
ARG NEXT_PUBLIC_HIDE_MODEL_SELECTOR
ENV NEXT_PUBLIC_HIDE_MODEL_SELECTOR=${NEXT_PUBLIC_HIDE_MODEL_SELECTOR}

# Dummy env vars for next build page data collection (not used at runtime)
ENV BETTER_AUTH_SECRET="build-placeholder-secret-min-32-chars!" \
    BETTER_AUTH_URL="http://localhost:3000" \
    STRIPE_SECRET_KEY="sk_placeholder_for_build" \
    STRIPE_WEBHOOK_SECRET="whsec_placeholder" \
    RESEND_API_KEY="re_placeholder" \
    RESEND_DEFAULT_SEGMENT_ID="dummy" \
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    DATABASE_DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    OPENAI_API_KEY="dummy" \
    SECRET_KEY="dummy" \
    REDIS_URL="http://localhost:6379" \
    TARGET_ENV="production" \
    TEMPORAL_SERVER_ADDRESS="http://localhost:7233" \
    TEMPORAL_NAMESPACE="dummy" \
    TEMPORAL_CERT="dummy" \
    TEMPORAL_KEY="dummy" \
    MEILISEARCH_URL="http://localhost:7700" \
    AWS_REGION="dummy" \
    AWS_ACCESS_KEY_ID="dummy" \
    AWS_SECRET_ACCESS_KEY="dummy" \
    PUSHER_APP_ID="dummy" \
    PUSHER_KEY="dummy" \
    PUSHER_SECRET="dummy" \
    NEXT_PUBLIC_PUSHER_KEY="dummy" \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="dummy" \
    NEXT_PUBLIC_OTEL_COLLECTOR_URL="" \
    NEXT_PUBLIC_OTEL_SERVICE_NAME="ragen-web-client" \
    NEXT_PUBLIC_TARGET_ENV="production" \
    GOOGLE_CLIENT_ID="dummy" \
    GOOGLE_CLIENT_SECRET="dummy" \
    GOOGLE_API_KEY="dummy" \
    MCP_GOOGLE_SERVER_URL="https://example.com" \
    MCP_GOOGLE_AUTH_URL="https://example.com" \
    MCP_CLICKUP_SERVER_URL="https://example.com" \
    MCP_HUBSPOT_SERVER_URL="https://example.com" \
    MCP_FIREFLIES_SERVER_URL="https://example.com" \
    RAGEN_TOKEN_VAULT_URL="http://localhost:3100" \
    RAGEN_TOKEN_VAULT_SERVICE_SECRET="0000000000000000000000000000000000000000000000000000000000000000" \
    DEFAULT_MODEL_PROVIDER="litellm" \
    DEFAULT_MODEL="gpt-5.4-nano" \
    LITELLM_PROXY_URL="http://localhost:4000"

RUN npm run web:build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Install prisma CLI with all deps in a temp dir (avoids standalone package.json conflicts)
# Then merge into app's node_modules for predeploy migrations
RUN cd /tmp && npm init -y > /dev/null 2>&1 && npm install prisma@7.3.0 > /dev/null 2>&1 \
    && cp -rP /tmp/node_modules/* /app/node_modules/ \
    && mkdir -p /app/node_modules/.bin \
    && ln -sf ../prisma/build/index.js /app/node_modules/.bin/prisma \
    && rm -rf /tmp/node_modules /tmp/package.json /tmp/package-lock.json \
    && chown -R nextjs:nodejs /app/node_modules

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Prefer IPv6 DNS resolution for Railway internal networking (neutral on IPv4-only networks)
ENV NODE_OPTIONS="--dns-result-order=ipv6first"

CMD ["node", "apps/web/server.js"]

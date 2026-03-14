FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma.config.ts prisma.config.ts
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Dummy env vars for next build page data collection (not used at runtime)
ENV BETTER_AUTH_SECRET="build-placeholder-secret-min-32-chars!" \
    BETTER_AUTH_URL="http://localhost:3000" \
    STRIPE_SECRET_KEY="sk_placeholder_for_build" \
    STRIPE_WEBHOOK_SECRET="whsec_placeholder" \
    RESEND_API_KEY="re_placeholder" \
    RESEND_DEFAULT_AUDIENCE_ID="dummy" \
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
    AWS_DOCUMENTS_BUCKET="dummy" \
    PUSHER_APP_ID="dummy" \
    PUSHER_KEY="dummy" \
    PUSHER_SECRET="dummy" \
    NEXT_PUBLIC_PUSHER_KEY="dummy" \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="dummy" \
    GOOGLE_CLIENT_ID="dummy" \
    GOOGLE_CLIENT_SECRET="dummy" \
    GOOGLE_API_KEY="dummy" \
    MCP_GOOGLE_SERVER_URL="https://example.com" \
    MCP_CLICKUP_SERVER_URL="https://example.com" \
    MCP_HUBSPOT_SERVER_URL="https://example.com" \
    MCP_FIREFLIES_SERVER_URL="https://example.com" \
    RAGEN_VAULT_URL="http://localhost:3100" \
    RAGEN_VAULT_SERVICE_SECRET="0000000000000000000000000000000000000000000000000000000000000000" \
    DEFAULT_MODEL_PROVIDER="google" \
    DEFAULT_MODEL="gemini-3-flash-preview"

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Install prisma CLI with all deps in a temp dir (avoids standalone package.json conflicts)
# Then merge into app's node_modules for predeploy migrations
RUN cd /tmp && npm init -y > /dev/null 2>&1 && npm install prisma@7.3.0 > /dev/null 2>&1 \
    && cp -r /tmp/node_modules/* /app/node_modules/ \
    && cp -r /tmp/node_modules/.bin/* /app/node_modules/.bin/ 2>/dev/null || true \
    && rm -rf /tmp/node_modules /tmp/package.json /tmp/package-lock.json \
    && chown -R nextjs:nodejs /app/node_modules

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

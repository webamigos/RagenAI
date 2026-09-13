FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/rag-core/package.json ./packages/rag-core/package.json
COPY packages/storage/package.json ./packages/storage/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma.config.ts prisma.config.ts

# --ignore-scripts, like every other app image here. Each @ragenai/* package
# has a `prepare` hook that runs its tsc build, and this stage deliberately
# carries only the manifests — no sources, no tsconfig — so those hooks fail
# with "The specified path does not exist: tsconfig.json". They are redundant
# anyway: the builder stage runs `npm run web:build`, which is turbo and builds
# every dependency package in graph order.
#
# Skipping scripts also skips the root prisma-generate postinstall, which is
# why the builder stage calls `npx prisma generate` explicitly below.
# ...and rebuild the native modules those scripts would have built. bcrypt is
# not optional here: without its compiled binding, `next build` dies collecting
# page data for the public-thread route with "Cannot find module
# bcrypt_lib.node". apps/api does the same for bcrypt and apps/admin for
# esbuild; apps/web reaches both, so it rebuilds both.
RUN npm ci --ignore-scripts && npm rebuild bcrypt esbuild

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Every browser-facing setting, and every one of them must be here.
#
# Next inlines `process.env.NEXT_PUBLIC_*` into the bundle at build time, so
# for these the build *is* the runtime: a name this file does not mention is
# empty in the shipped JavaScript no matter what the deployed service sets, and
# nothing reports it. `tests/architecture/next-public-vars-reach-the-build.test.ts`
# fails when `apps/web/src` reads a name that has no ARG here.
#
# Railway: declare matching variables under "Build" args on the service.
#
# The corollary is the mistake below this block was making: a NEXT_PUBLIC_*
# variable can never take a placeholder value "just to get the build through",
# because the placeholder is what every visitor's browser then runs on. Give it
# an empty default and let the code's own fallback decide.
ARG NEXT_PUBLIC_HIDE_MODEL_SELECTOR
ENV NEXT_PUBLIC_HIDE_MODEL_SELECTOR=${NEXT_PUBLIC_HIDE_MODEL_SELECTOR}

# The shared demo account's credentials, published on the sign-in page. The
# notice is gated on both being present, and `read()` in
# `libs/demo-credentials.ts` runs against what the bundle was compiled with —
# so a deployment that set them at runtime shows no notice and reports no
# error. Nothing here is a secret; see that file.
ARG NEXT_PUBLIC_DEMO_EMAIL
ENV NEXT_PUBLIC_DEMO_EMAIL=${NEXT_PUBLIC_DEMO_EMAIL}
ARG NEXT_PUBLIC_DEMO_PASSWORD
ENV NEXT_PUBLIC_DEMO_PASSWORD=${NEXT_PUBLIC_DEMO_PASSWORD}

# Fallback origin for links in emails and for the chat-widget embed snippet.
# `BETTER_AUTH_URL` is the source of truth and is read at runtime; this is what
# `app/emails/utils/base-url.ts` calls the fallback "for installs that only
# configured it", which without this ARG no Docker install could be.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Pusher, or the SSE fallback. Empty is a real configuration, not a missing
# one: `notification-client.ts` picks Pusher over SSE on the key alone, so a
# placeholder key here sends every browser to a Pusher app that does not exist
# and never falls back. Leave it empty unless Pusher is actually configured.
ARG NEXT_PUBLIC_PUSHER_KEY
ENV NEXT_PUBLIC_PUSHER_KEY=${NEXT_PUBLIC_PUSHER_KEY}
ARG NEXT_PUBLIC_PUSHER_CLUSTER
ENV NEXT_PUBLIC_PUSHER_CLUSTER=${NEXT_PUBLIC_PUSHER_CLUSTER}

# Domains the chat may link to without the `/r` interstitial. An empty list
# fails closed — every external link gets the confirmation page — so this
# missing only makes the interstitial unavoidable, never skipped.
ARG NEXT_PUBLIC_TRUSTED_LINK_DOMAINS
ENV NEXT_PUBLIC_TRUSTED_LINK_DOMAINS=${NEXT_PUBLIC_TRUSTED_LINK_DOMAINS}

# Browser telemetry. Empty collector = disabled, which is the default this
# image has always shipped. The service name carries a default because its two
# readers use `??`, and an ARG left unset arrives as `''` rather than undefined
# — `??` would keep the empty string and label every client span with nothing.
ARG NEXT_PUBLIC_OTEL_COLLECTOR_URL
ENV NEXT_PUBLIC_OTEL_COLLECTOR_URL=${NEXT_PUBLIC_OTEL_COLLECTOR_URL}
ARG NEXT_PUBLIC_OTEL_SERVICE_NAME=ragen-web-client
ENV NEXT_PUBLIC_OTEL_SERVICE_NAME=${NEXT_PUBLIC_OTEL_SERVICE_NAME}

# Read by the client logger (silent in production) and by the web-vitals tag.
# Defaulted to `production` because that is the value this image hardcoded
# before it was configurable, and the quieter of the two to get wrong.
ARG NEXT_PUBLIC_TARGET_ENV=production
ENV NEXT_PUBLIC_TARGET_ENV=${NEXT_PUBLIC_TARGET_ENV}

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

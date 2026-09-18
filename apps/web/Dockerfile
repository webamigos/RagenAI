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

# **No browser-facing build arguments, deliberately.**
#
# Next inlines `process.env.NEXT_PUBLIC_*` into the bundle while compiling, so
# anything declared here becomes part of the image — the publisher's answer,
# baked into every install that pulls it. That is why this was the one
# application `publish-images.yml` refused to publish while the worker, api,
# admin and mcp images went out.
#
# The browser-facing settings are read at *runtime* now, by
# `src/config/public-runtime-config.ts`: the server reads its own environment
# and renders the result into the document, the browser reads it back.
# `tests/architecture/next-public-vars-reach-the-build.test.ts` fails if either
# half comes back — a `NEXT_PUBLIC_*` read in `apps/web/src`, or an `ARG` here.
#
# Set the runtime names on the running service instead: `APP_URL`,
# `PUSHER_PUBLIC_KEY`, `PUSHER_CLUSTER`, `TRUSTED_LINK_DOMAINS`,
# `OTEL_COLLECTOR_URL`, `OTEL_SERVICE_NAME`, `TARGET_ENV`,
# `HIDE_MODEL_SELECTOR`, `DEMO_EMAIL`, `DEMO_PASSWORD`. The old `NEXT_PUBLIC_`
# spellings still work as a fallback, read from the environment rather than
# from the bundle, so nothing has to be reconfigured at once.

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

# The gateway's route table. Copied from the build context rather than from an
# earlier stage, so it does not depend on what that stage happened to include.
#
# Without this, `LLM_GATEWAY=native` fails at the first model call with
# "cannot read route table" — and that is the *only* deployment shape it fails
# in: docker-compose mounts this directory into every app service, so the file
# is present there and absent from the images Railway actually builds. The
# guard counting those mounts was green throughout, because it checked the
# shape that works. `dockerfile-ships-the-route-table.test.ts` now checks this
# one.
#
# `defaultRouteTablePath()` walks up from the process's cwd, which is why one
# location serves all three images despite the worker running from
# /app/apps/worker.
COPY --chown=nextjs:nodejs infra/llm-gateway ./infra/llm-gateway
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

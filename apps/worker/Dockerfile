# Build context is the MONOREPO ROOT, not this directory:
#   docker build -f apps/worker/Dockerfile .
# The lockfile lives at the root and npm resolves the workspace tree from there.

FROM node:24-slim AS base

# npm validates the whole workspace tree against the root lockfile, so every
# workspace manifest the lockfile knows about has to be present — even the ones
# this image never installs. Copying only the manifests keeps these layers
# cached across source changes.
FROM base AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY packages/db/package.json packages/db/

# @temporalio/core-bridge ships a native Rust addon whose install script we skip
# with --ignore-scripts (it would also run every other package's scripts,
# including the root's prisma-generate postinstall, which has no schema here).
# Building it explicitly afterwards is the supported escape hatch.
#
# Its path is resolved rather than hardcoded: the worker pins @temporalio/* away
# from the root's version, so npm nests it under apps/worker/node_modules in some
# trees and hoists it to /app/node_modules in others — and --omit=dev flips which
# one you get.
FROM manifests AS deps
RUN npm ci --workspace=@webamigos/ragen-worker --ignore-scripts \
    && cd "$(node -p "require('path').dirname(require.resolve('@temporalio/core-bridge/package.json',{paths:['/app/apps/worker']}))")" \
    && node ./scripts/build.js
RUN mkdir -p /app/apps/worker/node_modules

FROM manifests AS prod-deps
RUN npm ci --workspace=@webamigos/ragen-worker --omit=dev --ignore-scripts \
    && cd "$(node -p "require('path').dirname(require.resolve('@temporalio/core-bridge/package.json',{paths:['/app/apps/worker']}))")" \
    && node ./scripts/build.js
# Guarantee the nested workspace node_modules exists so the runner's COPY of it
# never fails on a tree where npm happened to hoist everything.
RUN mkdir -p /app/apps/worker/node_modules

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/worker ./apps/worker
# The worker pins @temporalio/* and typescript away from the root's versions, so
# npm nests those under apps/worker/node_modules. Without this the build resolves
# the root's TypeScript and cannot find @temporalio/common at all.
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
RUN npm run build --workspace=@webamigos/ragen-worker

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 worker

# Workspace installs hoist to the root node_modules; anything whose version
# conflicts with another workspace nests under apps/worker/node_modules, so both
# have to come across or resolution breaks at runtime.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/public ./apps/worker/public
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY package.json ./package.json

USER worker

# Prefer IPv6 DNS resolution for Railway internal networking (neutral on IPv4-only networks)
ENV NODE_OPTIONS="--dns-result-order=ipv6first"

WORKDIR /app/apps/worker
CMD ["node", "dist/worker.js"]

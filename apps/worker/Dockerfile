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
# Real workspace dependencies, not just manifests npm wants to see:
# node_modules/@ragenai/* are symlinks into packages/, so each manifest has to
# be here for `npm ci` to link it, each has to be built in the builder stage,
# and each built dist/ has to reach the runner. Miss any of the three and the
# build fails naming a package nobody touched — see
# docs/lessons/workspace-scoped-npm-ci-nests-conflicting-versions.md.
COPY packages/rag-core/package.json packages/rag-core/
COPY packages/observability/package.json packages/observability/
COPY packages/storage/package.json packages/storage/
COPY packages/env/package.json packages/env/

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
RUN npm ci --workspace=@webamigos/ragen-worker \
    --workspace=@ragenai/rag-core \
    --workspace=@ragenai/observability \
    --workspace=@ragenai/storage \
    --workspace=@ragenai/env \
    --ignore-scripts \
    && cd "$(node -p "require('path').dirname(require.resolve('@temporalio/core-bridge/package.json',{paths:['/app/apps/worker']}))")" \
    && node ./scripts/build.js
RUN mkdir -p /app/apps/worker/node_modules

FROM manifests AS prod-deps
RUN npm ci --workspace=@webamigos/ragen-worker \
    --workspace=@ragenai/rag-core \
    --workspace=@ragenai/observability \
    --workspace=@ragenai/storage \
    --workspace=@ragenai/env \
    --omit=dev --ignore-scripts \
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
# The whole directory rather than each package, so a future dependency needs
# only its manifest, install and build lines rather than a fourth edit here.
COPY packages ./packages
# The worker pins @temporalio/* and typescript away from the root's versions, so
# npm nests those under apps/worker/node_modules. Without this the build resolves
# the root's TypeScript and cannot find @temporalio/common at all.
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
# Each package resolves through `main: ./dist/index.js`, `--ignore-scripts`
# above skipped the `prepare` hook that would have built it, and .dockerignore
# excludes **/dist so a locally-built one never enters the context. Without
# these the worker's tsc fails with "Cannot find module '@ragenai/…'" — which
# is how this image came to be unbuildable from a clean checkout.
#
# **The order is the dependency order, and it is load-bearing.** These are
# built one workspace at a time rather than through turbo, so nothing derives
# it from the graph — `@ragenai/storage` imports `@ragenai/env`, so env has to
# emit its declarations first or storage's tsc fails with "Cannot find module
# '@ragenai/env'". That is exactly how this broke: ADR-37's env package gained
# a consumer here and this list was not reordered with it.
#
# `tests/architecture/dockerfile-package-build-order.test.ts` now derives the
# required order from each package.json and fails when this list contradicts
# it, so the next edge added to the graph cannot silently break the image.
RUN npm run build --workspace=@ragenai/env \
    && npm run build --workspace=@ragenai/rag-core \
    && npm run build --workspace=@ragenai/observability \
    && npm run build --workspace=@ragenai/storage
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
# node_modules/@ragenai/* are symlinks into packages/, so without the targets
# every link dangles and the container cannot start.
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/public ./apps/worker/public
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY package.json ./package.json

USER worker

# Prefer IPv6 DNS resolution for Railway internal networking (neutral on IPv4-only networks)
ENV NODE_OPTIONS="--dns-result-order=ipv6first"

WORKDIR /app/apps/worker
CMD ["node", "dist/worker.js"]

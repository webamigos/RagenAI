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
COPY packages/crypto/package.json packages/crypto/
COPY packages/rag-core/package.json packages/rag-core/
COPY packages/observability/package.json packages/observability/
COPY packages/storage/package.json packages/storage/
COPY packages/env/package.json packages/env/
COPY packages/platform-contracts/package.json packages/platform-contracts/

# --ignore-scripts stays: it stops every other package's install script from
# running, including the root's prisma-generate postinstall, which has no
# schema in this image.
#
# There is no longer anything to build afterwards. @temporalio/core-bridge used
# to ship a native Rust addon that its install script compiled, and the image
# ran `node ./scripts/build.js` explicitly to make up for --ignore-scripts.
# From 1.23 the package has no install hook at all and carries prebuilt
# binaries instead — `releases/<target>/index.node`, listed in its `files`, for
# both Linux architectures. `getPrebuiltPath()` loads one of those and throws if
# it is absent; it never falls back to a locally built artifact. So the build
# step became both unnecessary and impossible: `scripts/build.js` is now
# `scripts/build.ts`, and the image failed with MODULE_NOT_FOUND.
FROM manifests AS deps
RUN npm ci --workspace=@webamigos/ragen-worker \
    --workspace=@ragenai/crypto \
    --workspace=@ragenai/rag-core \
    --workspace=@ragenai/observability \
    --workspace=@ragenai/storage \
    --workspace=@ragenai/env \
    --workspace=@ragenai/platform-contracts \
    --ignore-scripts
RUN mkdir -p /app/apps/worker/node_modules

FROM manifests AS prod-deps
RUN npm ci --workspace=@webamigos/ragen-worker \
    --workspace=@ragenai/crypto \
    --workspace=@ragenai/rag-core \
    --workspace=@ragenai/observability \
    --workspace=@ragenai/storage \
    --workspace=@ragenai/env \
    --workspace=@ragenai/platform-contracts \
    --omit=dev --ignore-scripts
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
# The builder stage is FROM base, not FROM manifests, so it inherits nothing
# that stage copied — the schema has to arrive here, where `prisma generate`
# reads it. Getting this wrong is invisible locally and fails only in the
# image, which is why ADR-40 made this its own step.
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma.config.ts prisma.config.ts
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
    && npm run build --workspace=@ragenai/crypto \
    && npm run build --workspace=@ragenai/platform-contracts \
    && npm run build --workspace=@ragenai/rag-core \
    && npm run build --workspace=@ragenai/observability \
    && npm run build --workspace=@ragenai/storage
# Generated from the monorepo's single shared schema via the `workerClient`
# generator block (ADR-40). `npm ci --ignore-scripts` above skipped the root's
# prisma-generate postinstall, so this is explicit — the same reason
# apps/api/Dockerfile and apps/web/Dockerfile both call it.
#
# The output lands in apps/worker/generated/, *outside* src/: the worker builds
# with plain `tsc --build`, which emits only what it compiles, and the client is
# .js/.mjs/.wasm. Under src/ it would be missing from dist/ entirely.
RUN npx prisma generate
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
# The generated Prisma client, which dist/ imports by a relative path that
# resolves the same from src/ and from dist/ because both are children of
# apps/worker. Not copied by the dist COPY above, since it is not in dist.
COPY --from=builder /app/apps/worker/generated ./apps/worker/generated
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

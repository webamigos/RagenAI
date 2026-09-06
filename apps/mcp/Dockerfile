# Build context is the MONOREPO ROOT, not this directory:
#   docker build -f apps/mcp/Dockerfile .
# The lockfile lives at the root and npm resolves the workspace tree from there.

FROM node:24-slim AS base

# npm validates the whole workspace tree against the root lockfile, so every
# workspace manifest the lockfile knows about has to be present — even the
# ones this image never installs. Copying only the manifests keeps these
# layers cached across source changes.
FROM base AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/mcp/package.json apps/mcp/
# A real workspace dependency (@ragenai/observability, ADR-28), not just a
# manifest npm wants to see: node_modules/@ragenai/observability is a symlink
# to packages/observability, so its manifest has to be here for `npm ci` to
# link it, and its built dist/ has to reach the runner stage below.
COPY packages/observability/package.json packages/observability/

FROM manifests AS prod-deps
RUN npm ci --workspace=@webamigos/ragen-mcp --omit=dev --ignore-scripts
# Guarantee the nested workspace node_modules exists so the runner's COPY of
# it never fails on a tree where npm happened to hoist everything.
RUN mkdir -p /app/apps/mcp/node_modules

# --workspace is given twice: the second one pulls in packages/observability's
# own devDependencies (its pinned TypeScript), which the builder stage needs
# to compile it. --ignore-scripts skips its `prepare` hook, so that build has
# to be run explicitly below rather than happening as part of the install.
FROM manifests AS deps
RUN npm ci \
    --workspace=@webamigos/ragen-mcp \
    --workspace=@ragenai/observability \
    --ignore-scripts
RUN mkdir -p /app/apps/mcp/node_modules /app/packages/observability/node_modules

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/mcp ./apps/mcp
COPY packages/observability ./packages/observability
# Anything whose version conflicts with another workspace's nests instead of
# hoisting — apps/mcp's fastmcp and its TypeScript 5.8 (the package pins ~5.7)
# all land here — so without these the build fails on "Cannot find module
# 'fastmcp'". Must come after the two COPYs above, which would overwrite them.
COPY --from=deps /app/apps/mcp/node_modules ./apps/mcp/node_modules
COPY --from=deps /app/packages/observability/node_modules ./packages/observability/node_modules
# Order is spelled out rather than delegated to turbo: turbo is a root
# devDependency and the installs above are workspace-scoped, so it is not in
# this image. apps/mcp resolves @ragenai/observability through its
# `main: ./dist/index.js` and .dockerignore excludes **/dist, so without the
# first line tsc fails with "Cannot find module '@ragenai/observability'".
RUN npm run build --workspace=@ragenai/observability
RUN npm run build --workspace=@webamigos/ragen-mcp

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 mcp

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/mcp/node_modules ./apps/mcp/node_modules
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist
COPY --from=builder /app/apps/mcp/package.json ./apps/mcp/package.json
# node_modules/@ragenai/observability is a symlink into packages/, so without
# the target the link dangles and the container cannot start — same reason
# apps/api's Dockerfile copies its packages/ across.
COPY --from=builder /app/packages/observability/dist ./packages/observability/dist
COPY --from=builder /app/packages/observability/package.json ./packages/observability/package.json
COPY package.json ./package.json

USER mcp

# Prefer IPv6 DNS resolution for Railway internal networking (neutral on IPv4-only networks)
ENV NODE_OPTIONS="--dns-result-order=ipv6first"

WORKDIR /app/apps/mcp
CMD ["node", "dist/index.js"]

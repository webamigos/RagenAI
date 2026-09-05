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

FROM manifests AS prod-deps
RUN npm ci --workspace=@webamigos/ragen-mcp --omit=dev --ignore-scripts

FROM manifests AS deps
RUN npm ci --workspace=@webamigos/ragen-mcp --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/mcp ./apps/mcp
RUN npm run build --workspace=@webamigos/ragen-mcp

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 mcp

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist
COPY --from=builder /app/apps/mcp/package.json ./apps/mcp/package.json
COPY package.json ./package.json

USER mcp

# Prefer IPv6 DNS resolution for Railway internal networking (neutral on IPv4-only networks)
ENV NODE_OPTIONS="--dns-result-order=ipv6first"

WORKDIR /app/apps/mcp
CMD ["node", "dist/index.js"]

# Build context is the MONOREPO ROOT, not this directory:
#   docker build -f apps/docs/Dockerfile .
# The lockfile lives at the root and npm resolves the workspace tree from there.

FROM node:24-alpine AS build

WORKDIR /app

# npm validates the whole workspace tree against the root lockfile, so every
# workspace manifest it knows about has to be present — even the ones this
# image never installs. Copying only the manifests keeps this layer cached
# across documentation changes.
COPY package.json package-lock.json ./
COPY apps/docs/package.json apps/docs/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/rag-core/package.json packages/rag-core/
COPY packages/storage/package.json packages/storage/
COPY packages/observability/package.json packages/observability/

# --ignore-scripts skips the root's prisma-generate postinstall, which needs a
# schema this image does not carry and which a static site has no use for.
RUN npm ci --workspace=@webamigos/ragen-docs --ignore-scripts

COPY apps/docs apps/docs

# The analytics id is baked into the static output, so it has to be present
# *here*, at build time — a Railway service variable set for the deploy alone
# arrives too late, and Railway hands service variables to a Dockerfile build
# only through an explicit ARG. Left unset the build carries no analytics,
# which is what a self-hosted or local build should do.
ARG DOCS_GTAG_ID
ENV DOCS_GTAG_ID=$DOCS_GTAG_ID

RUN npm run build --workspace=@webamigos/ragen-docs

FROM nginx:alpine

COPY --from=build /app/apps/docs/build /usr/share/nginx/html
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

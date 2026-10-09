# Railway template

A Railway template that deploys Ragen with the document pipeline, the token
vault and the MCP server, **without Presidio**, and asks for one value: an
`OPENROUTER_API_KEY`.

A template is **not a file in this repository**. It is built in Railway's
template composer, or generated from a project (Project → Settings → *Generate
Template from Project*), and it lives in the workspace that owns it
([Railway: templates](https://docs.railway.com/templates/create)). This
document is therefore the source of truth for *what the template contains*:
rebuild it from here, and change it here first. That is the same arrangement as
the rest of Railway configuration, which stays in the dashboard until
`.railway/railway.ts` is adopted ([ADR-47](adrs/47-railway-configuration-lives-in-the-dashboard.md)).

> **Status: specification, not yet built.** Section 6 lists what has to be
> verified in the composer before the first publish. Nothing below has been run
> as a template yet; the values were read from the code and from the running
> `demo` environment.

## 1. What a deployer gets

| | |
|---|---|
| Asked for | `OPENROUTER_API_KEY` |
| Generated | every secret (section 4) |
| Models | Claude Sonnet 5.5 answers; Claude Haiku 5.5 rephrases, summarises and scores; OpenAI `text-embedding-3-small` embeds (1536 dimensions). All through OpenRouter, from the routes the images already carry (`infra/llm-gateway/routes.yaml`) |
| Left out | Presidio — **PII masking is off**. It turns on only when `PRESIDIO_ANALYZER_URL` and `PRESIDIO_ANONYMIZER_URL` are both set (`packages/env/src/pii.ts`), so there is nothing to disable |
| Left out | Admin app, connectors (`ragen-connectors`), Temporal (BullMQ on Redis is the runtime, ADR-44), LiteLLM (gone, ADR-49), Meilisearch |

**Why OpenRouter and not a cloud account.** One key serves chat *and*
embeddings, so the knowledge base works from the first upload. The
installer ranks it first for the same reason (`create-ragen-app`,
`llm-provider.ts`). OpenAI directly is the alternative; it needs a route table
of its own, which a template cannot mount — see section 6.

## 2. Services

Eleven services in one project. Names are short on purpose: they appear inside
every reference variable (`${{web.PORT}}`), and a name with a space or a dash
is one more thing to get wrong.

| Service | Source | Port | Public | Volume | Healthcheck |
|---|---|---|---|---|---|
| `postgres` | `ghcr.io/railwayapp-templates/postgres-ssl:16` | 5432 | no | yes | — |
| `vault-db` | `ghcr.io/railwayapp-templates/postgres-ssl:16` | 5432 | no | yes | — |
| `redis` | Railway's own Redis | 6379 | no | yes | — |
| `qdrant` | `qdrant/qdrant` | 6333 | no | yes, `/qdrant/storage` | `/readyz` |
| `docling` | built from this repo, `infra/docling/Dockerfile` (see 6.5) | 5001 | no | — | — |
| `storage` | Railway bucket, or `rustfs/rustfs` with a volume (see 6.1) | — | no | yes if RustFS | — |
| `migrate` | `ghcr.io/webamigos/ragen-migrate:latest` | — | no | — | — |
| `web` | `ghcr.io/webamigos/ragen-web:latest` | 3000 | **yes** | — | `/api/healthcheck` |
| `api` | `ghcr.io/webamigos/ragen-api:latest` | 3001 | no | — | — |
| `worker` | `ghcr.io/webamigos/ragen-worker:latest` | — | no | — | — |
| `vault` | `ghcr.io/webamigos/ragen-token-vault:latest` | 3100 | no | — | `/health` |
| `mcp` | `ghcr.io/webamigos/ragen-mcp:latest` | 3300 | **yes** | — | `/health` |

Notes that decide the layout:

- **No build on the deployer's side** for everything except Docling. The images
  are public, two-architecture manifests published by `publish-images.yml`; the
  vault's come from `ragen-token-vault`'s own workflow.
- **Pin a version, not `latest`, in the published template** — a template that
  tracks `latest` deploys whatever the next release is into someone's project.
  Use the release tag (`:1.2.3`), and bump it when the template is re-published.
- **Two Postgres services, not one.** The vault holds every connector token and
  has its own database (`ragen-token-vault` migrates its own schema). Keeping it
  on a separate instance means a restore of the application database cannot
  roll the vault back.
- **Set `PORT` explicitly on each service.** Railway injects its own, and the
  demo's private URLs end in `:8080` because of it. A fixed `PORT` makes every
  private reference deterministic.
- **Only `web` and `mcp` are public.** `api` is reached by `web` over the
  private network; the public API is a later decision, not a default.

## 3. Variables per service

References use Railway's syntax: `${{service.VARIABLE}}`, and
`${{service.RAILWAY_PRIVATE_DOMAIN}}` for the internal hostname. `secret(n, "…")`
is a template function, evaluated once at deploy time. Where one secret must be
identical in two services, **generate it in one and reference it from the
other** — never generate it twice.

Shorthand used below:

```text
HEX64  = ${{secret(64, "abcdef0123456789")}}      # openssl rand -hex 32
```

### `web`

| Variable | Value |
|---|---|
| `PORT` | `3000` |
| `TARGET_ENV` | `production` |
| `DATABASE_URL` | `${{postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{redis.REDIS_URL}}` |
| `QDRANT_URL` | `http://${{qdrant.RAILWAY_PRIVATE_DOMAIN}}:6333` |
| `RAGEN_API_INTERNAL_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001` |
| `APP_URL`, `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `RAGEN_TOKEN_VAULT_URL` | `http://${{vault.RAILWAY_PRIVATE_DOMAIN}}:3100` |
| `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | `${{vault.RAGEN_TOKEN_VAULT_SERVICE_SECRET}}` |
| `OPENROUTER_API_KEY` | **asked** |
| `DEFAULT_MODEL` | `claude-sonnet-5-5-openrouter` |
| `DEFAULT_MODEL_PROVIDER` | `litellm` — the pricing namespace, not a gateway |
| `REPHRASE_MODEL`, `SUMMARY_MODEL`, `SCORING_MODEL` | `claude-haiku-5-5-openrouter` |
| `EMBEDDINGS_MODEL` | `text-embedding-3-small-openrouter` |
| `VECTOR_SIZE` | `1536` |
| `STORAGE_PROVIDER` | `s3`, plus the four `S3_*` variables (section 5) |
| `ENCRYPTION_PROVIDER` | `local` |
| `ENCRYPTION_MASTER_KEY` | HEX64 — **generated here, referenced elsewhere** |
| `BETTER_AUTH_SECRET`, `SECRET_KEY`, `PUBLIC_LINK_TOKEN_SECRET`, `WORKER_SECRET_KEY` | HEX64 each |
| `SESSION_AUTH_SECRET`, `INTERNAL_API_SECRET`, `MCP_SERVICE_SECRET` | HEX64 each; `MCP_SERVICE_SECRET` **must differ** from `SESSION_AUTH_SECRET` |
| `RAGEN_MCP_PUBLIC_URL` | `https://${{mcp.RAILWAY_PUBLIC_DOMAIN}}/mcp` |

`NEXT_PUBLIC_APP_URL` is deliberately absent: it is baked in at build time and
cannot be set on a prebuilt image. `APP_URL` is the runtime name
(`docs/lessons/next-public-vars-are-baked-in-at-build-time.md`).

### `api`

| Variable | Value |
|---|---|
| `PORT` | `3001` |
| `TARGET_ENV` | `production` |
| `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL` | as `web` |
| `RAGEN_APP_INTERNAL_URL` | `http://${{web.RAILWAY_PRIVATE_DOMAIN}}:3000` |
| `RAGEN_TOKEN_VAULT_URL`, `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | as `web` |
| `INTERNAL_API_SECRET`, `SESSION_AUTH_SECRET`, `MCP_SERVICE_SECRET`, `SECRET_KEY`, `WORKER_SECRET_KEY` | `${{web.<same name>}}` |
| `ENCRYPTION_PROVIDER`, `ENCRYPTION_MASTER_KEY` | `local`, `${{web.ENCRYPTION_MASTER_KEY}}` |
| `OPENROUTER_API_KEY`, the five model variables, `VECTOR_SIZE`, storage | `${{web.<same name>}}` |

`api` refuses to boot in a deployed `TARGET_ENV` without `INTERNAL_API_SECRET`
and `QDRANT_URL`, and without `REDIS_URL` under BullMQ.

### `worker`

| Variable | Value |
|---|---|
| `TARGET_ENV` | `production` |
| `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL` | as `web` |
| `RAGEN_APP_URL` | `http://${{web.RAILWAY_PRIVATE_DOMAIN}}:3000` |
| `DOCLING_URL` | `http://${{docling.RAILWAY_PRIVATE_DOMAIN}}:5001` |
| `DOCUMENT_PARSER` | `docling` (the default; set `legacy` to drop `docling` from the template) |
| `ENCRYPTION_PROVIDER`, `ENCRYPTION_MASTER_KEY` | `local`, `${{web.ENCRYPTION_MASTER_KEY}}` |
| `OPENROUTER_API_KEY`, model variables, `VECTOR_SIZE`, storage | `${{web.<same name>}}` |

The worker takes the **same** encryption key and the same storage as `web` and
`api`, or it writes documents the app cannot read or decrypt (ADR-27).

### `vault`

| Variable | Value |
|---|---|
| `PORT` | `3100` |
| `HOST` | `::` — the private network is IPv6 |
| `NODE_ENV` | `production` |
| `TARGET_ENV` | `production` |
| `DATABASE_URL` | `${{vault-db.DATABASE_URL}}` |
| `ENCRYPTION_KEY` | HEX64 — **this is the vault's own key**, unrelated to `ENCRYPTION_MASTER_KEY` |
| `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | HEX64 — generated here, referenced by `web`, `api` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | optional, empty; only for Google connectors |

It needs `npx prisma migrate deploy` before start (6.3).

### `mcp`

| Variable | Value |
|---|---|
| `PORT` | `3300` |
| `TARGET_ENV` | `production` |
| `RAGEN_API_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001` |
| `MCP_OAUTH_ENABLED` | `false` |

`mcp` has no database and no secret of its own with OAuth off: callers send
their own Ragen API key, which `api` validates against the vault. It serves
`/mcp` and `/health` on the one routed port (`apps/mcp/src/index.ts`).

To turn on sign-in with OAuth instead of API keys, set `MCP_OAUTH_ENABLED=true`
on `mcp`, `api` and `web`, and add `BETTER_AUTH_URL` (the public HTTPS origin of
`web`, no path) and `MCP_SERVICE_SECRET` (`${{web.MCP_SERVICE_SECRET}}`) to
`mcp`. The spec is
[`2026-10-05-mcp-sign-in-with-oauth.md`](specs/2026-10-05-mcp-sign-in-with-oauth.md).
It is off here because the first run should need no browser consent flow.

### `migrate`

`DATABASE_URL=${{postgres.DATABASE_URL}}` and `TARGET_ENV=production`. It
applies the Prisma migrations and the seed, then exits — a one-shot, so its
restart policy has to be **Never**, not On failure.

### Datastores

| Service | Variables |
|---|---|
| `postgres`, `vault-db` | Railway's own: `POSTGRES_PASSWORD` is `${{secret(32)}}`; databases named `ragen` and `ragen-token-vault` |
| `redis` | Railway's own `REDIS_URL` |
| `qdrant` | none required. Add `QDRANT__SERVICE__API_KEY` and `QDRANT_API_KEY` on its clients only if it is ever made public |

## 4. The secrets, in one place

| Secret | Generated in | Referenced from |
|---|---|---|
| `ENCRYPTION_MASTER_KEY` | `web` | `api`, `worker` |
| `SECRET_KEY`, `WORKER_SECRET_KEY` | `web` | `api` |
| `SESSION_AUTH_SECRET`, `INTERNAL_API_SECRET`, `MCP_SERVICE_SECRET` | `web` | `api` |
| `BETTER_AUTH_SECRET`, `PUBLIC_LINK_TOKEN_SECRET` | `web` | — |
| `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | `vault` | `web`, `api` |
| `ENCRYPTION_KEY` | `vault` | — |

This is the list `create-ragen-app` generates for a local install
(`manifest.ts`), plus the vault's pair. **`ENCRYPTION_MASTER_KEY` is the one
that cannot be regenerated:** thread messages are encrypted under it, and a new
value makes the existing ones unreadable. `local` is also the weakest
provider (ADR-02) — a key in an environment variable, held by every service
that reads messages. The template says so on its overview page; a deployment
that needs a KMS sets `ENCRYPTION_PROVIDER` and its credentials instead.

## 5. Object storage

Railway volumes belong to **one** service. The `local` storage provider needs a
volume shared by `web`, `api` and `worker` (ADR-27), which Railway cannot give
them, so the template uses S3 (`STORAGE_PROVIDER=s3`).

| Variable | From a Railway bucket | From RustFS (`storage`) |
|---|---|---|
| `S3_BUCKET_NAME` | the bucket's `BUCKET` | `ragen` (created once, see 6.1) |
| `S3_REGION` | `REGION` (e.g. `auto`) | `us-east-1` |
| `S3_ACCESS_KEY_ID` | `ACCESS_KEY_ID` | `${{secret(20)}}` on `storage`, referenced |
| `S3_SECRET_ACCESS_KEY` | `SECRET_ACCESS_KEY` | `${{secret(40)}}` on `storage`, referenced |
| `S3_ENDPOINT_URL` | `ENDPOINT` | `http://${{storage.RAILWAY_PRIVATE_DOMAIN}}:9000` |
| `S3_FORCE_PATH_STYLE` | blank (buckets default to virtual-hosted style) | `true` |

A Railway bucket is reachable **only over public networking**, so traffic from
`web`, `api` and `worker` leaves the private network; bucket egress is free, a
service's own egress is not.

## 6. To verify before the first publish

These are the points a document cannot settle. Each one decides a service
setting or a service's existence, so none is optional.

1. **Can a template include a bucket?** Railway's bucket documentation does not
   say. Check the composer's *Add New* menu. If not, use RustFS with a volume,
   and decide how the `ragen` bucket gets created — a one-shot step, the same
   kind of problem as `migrate`.
2. **Does the S3 client work against a virtual-hosted-style endpoint?** The
   storage package is exercised against path-style stores (RustFS, Scaleway).
   Upload, download and delete one document on a real bucket before trusting
   `S3_FORCE_PATH_STYLE` left blank.
3. **Vault migrations.** The vault image's `CMD` is `node dist/index.js` and
   its Railway project ran `npx prisma migrate deploy` as a *pre-deploy
   command*. Find out whether the composer exposes one. If not, the vault needs
   its own one-shot like `migrate`, or a start command of
   `sh -c "npx prisma migrate deploy && node dist/index.js"`.
4. **Start order.** Compose gates the apps on `migrate` finishing; Railway has
   no `depends_on`. `web`, `api` and `worker` will start against an empty
   database and fail until `migrate` has run, then recover on their restart
   policy. Confirm they do, and that the first boot does not leave a failed
   state a deployer has to clear by hand.
5. **Docling has no published image.** `publish-images.yml` builds six images
   and Docling is not one of them. Either the template builds it from this
   repository (root directory `/`, Dockerfile path `infra/docling/Dockerfile`,
   slow, and a build on every deployer's account), or `docling` joins the
   publish matrix and the template pulls `ghcr.io/webamigos/ragen-docling`.
   The second is the right one; it is a change to the workflow, not to the
   template.
6. **A route table is a file.** The images carry the one in
   `infra/llm-gateway/routes.yaml`, which now includes the three OpenRouter
   routes. A second provider (OpenAI directly) cannot be added with a variable
   alone; it needs a route-table source that is not a file, or a second set of
   routes in the shipped table. Not needed for the first template.
7. **Private networking addressing.** The `demo` environment resolves
   `*.railway.internal` over IPv6 and works with these images
   (`--dns-result-order=ipv6first`). Confirm in a fresh project that `web`
   (which binds `0.0.0.0`) is reachable from `api`; if not, set `HOSTNAME=::`.
8. **Image visibility.** The template pulls from `ghcr.io/webamigos/…` with
   no credentials, so every package it names (the six apps, `migrate`, the
   vault) has to be public. A private package fails the deploy with a pull
   error that names nothing about visibility.
9. **Sizing.** Docling is the heavy one. Measure the project's idle memory
   before writing the cost into the overview page.

## 7. The overview page

Railway asks a published template for a fixed shape (H1 "Deploy and Host
Ragen with Railway", *About*, *Common use cases*, *Dependencies*, *Why deploy on
Railway*). Beyond that, it should state four things a deployer would otherwise
discover by accident:

- the one value to enter, and where to get it;
- that **PII masking is off** and why;
- that `ENCRYPTION_MASTER_KEY` must be backed up, because nothing can recover it;
- that the first sign-in creates the owner account, and that the template ships
  no demo credentials.

## 8. Keeping it current

A change to any of these means the template needs the same edit and a new
publish — nothing else exercises it:

- a new or renamed environment variable an app now requires at boot;
- a change to a default model, `VECTOR_SIZE`, or the OpenRouter routes;
- a new image, or a published image renamed;
- a new service the stack cannot run without.

That is the same list that makes `packages/create-ragen-app` change
([README](../packages/create-ragen-app/README.md)), and for the same reason:
the first-run path is not covered by CI. Template users are notified when a
published template changes
([Railway: template updates](https://docs.railway.com/templates/updates)), so a
re-publish reaches existing deployments as an update prompt, not silently.

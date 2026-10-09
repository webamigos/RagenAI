# Railway template

A Railway template that deploys Ragen with the document pipeline, Ragen Brain,
the token vault, the MCP server and the admin panel, **without Presidio**, and
asks for one value: an `OPENROUTER_API_KEY`.

A template is **not a file in this repository**. It is built in Railway's
template composer, or generated from a project (Project → Settings → *Generate
Template from Project*), and it lives in the workspace that owns it
([Railway: templates](https://docs.railway.com/templates/create)). This
document is therefore the source of truth for *what the template contains*:
rebuild it from here, and change it here first. That is the same arrangement as
the rest of Railway configuration, which stays in the dashboard until
`.railway/railway.ts` is adopted ([ADR-47](adrs/47-railway-configuration-lives-in-the-dashboard.md)).

> **Status (2026-10-09): built and run end to end on 2.52.0 as a project, not
> yet published as a template.** The project `ragen-template-test` (workspace
> *Web Amigos*) was assembled from this document and deployed. Section 6 says
> what that proved and what is still open. The images it needs are **2.52.0 or later** — earlier
> ones cannot chat without an OpenAI key (#1619) and cannot switch Brain on at
> install (#1620).

## 1. What a deployer gets

| | |
|---|---|
| Asked for | `OPENROUTER_API_KEY` |
| Generated | every secret (section 4) |
| Models | Claude Sonnet 5.5 answers; Claude Haiku 5.5 rephrases, summarises and scores; OpenAI `text-embedding-3-small` embeds (1536 dimensions). All through OpenRouter, from the routes the images already carry (`infra/llm-gateway/routes.yaml`) |
| On from the first boot | Ragen Brain (`RAGEN_DEFAULT_FEATURES=brain` on `migrate`, section 3) |
| Off | **PII masking** — no Presidio. It turns on only when `PRESIDIO_ANALYZER_URL` and `PRESIDIO_ANONYMIZER_URL` are both set (`packages/env/src/pii.ts`) |
| Off | **Content moderation** — it needs an OpenAI key (`OPENAI_MODERATION_KEY`). Without one the guardrail logs "not configured" and lets turns through; the setup checklist recommends the key |
| Left out | Connectors (`ragen-connectors`), Temporal (BullMQ on Redis is the runtime, ADR-44), LiteLLM (gone, ADR-49), Meilisearch |

**Why OpenRouter and not a cloud account.** One key serves chat *and*
embeddings, so the knowledge base works from the first upload. The installer
ranks it first for the same reason, and since `create-ragen-app` 0.9.0 it
writes the same model ids as this template.

## 2. Services

Thirteen services in one project, in the canvas groups the `demo` project uses:

| Group | Service | Source | Port | Public | Volume | Healthcheck |
|---|---|---|---|---|---|---|
| Ragen App | `web` | `ghcr.io/webamigos/ragen-web:<version>` | 3000 | **yes** | — | `/api/healthcheck` |
| Ragen App | `migrate` | `ghcr.io/webamigos/ragen-migrate:<version>` | — | no | — | — (restart: **Never**) |
| Ragen API | `api` | `ghcr.io/webamigos/ragen-api:<version>` | 3001 | no | — | — |
| Ragen Worker | `worker` | `ghcr.io/webamigos/ragen-worker:<version>` | — | no | — | — |
| *(beside the worker)* | `docling` | GitHub repo `webamigos/RagenAI`, root `/`, `RAILWAY_DOCKERFILE_PATH=infra/docling/Dockerfile` — as `demo` builds it | 5001 | no | — | — |
| Ragen MCP | `mcp` | `ghcr.io/webamigos/ragen-mcp:<version>` | 3300 | **yes** | — | `/health` |
| Ragen Admin | `admin` | `ghcr.io/webamigos/ragen-admin:<version>` | 3200 | **yes** | — | — (`/` redirects to sign-in) |
| Ragen Token Vault | `vault` | `ghcr.io/webamigos/ragen-token-vault:latest` | 3100 | no | — | `/health` |
| Ragen Token Vault | `postgres-token-vault` | Railway Postgres | 5432 | no | yes | — |
| Storage | `postgres` | Railway Postgres | 5432 | no | yes | — |
| Storage | `redis` | Railway Redis | 6379 | no | yes | — |
| Storage | `qdrant` | `qdrant/qdrant` | 6333 | **no** | yes, `/qdrant/storage` | `/readyz` |
| Storage | bucket | Railway Bucket (*Add → Bucket*; Railway names it) | — | — | — | — |

Notes that decide the layout:

- **One build on the deployer's side, Docling's.** Everything else is a public,
  two-architecture image (`publish-images.yml`; the vault's from
  `ragen-token-vault`'s own workflow). Docling is a thin layer — an entrypoint
  and a port forwarder that listen on IPv4 *and* IPv6 — over the pinned
  upstream `docling-serve-cpu` image, so the build is mostly pulling that base.
  The upstream image alone with `UVICORN_HOST=::` would remove the build, but
  has never run on Railway's private network; try it in a test project first.
- **Pin a release, not `latest`**, for the Ragen images, and bump it when the
  template is re-published. `<version>` above is that release (2.52.0 or
  later). A tag exists only once `publish-images.yml` has finished for it — it
  runs well after the release itself, and a deploy against a tag that is not
  there yet fails with an empty `imageDigest` and no log at all.
- **Two Postgres services.** The vault holds every connector token and migrates
  its own schema; a separate instance means restoring the application database
  cannot roll the vault back.
- **`PORT` is set explicitly on every app.** Railway injects its own otherwise
  (the `demo` private URLs end in `:8080` because of it); a fixed one makes
  every private reference deterministic.
- **Public: `web`, `mcp`, `admin`. Never `qdrant`.** Every client reaches it at
  `qdrant.railway.internal`. The marketplace Qdrant template generates a public
  domain, and with no API key that domain answers anyone — the `demo` project
  had exactly this until 2026-10-09.
- **Icons**: the Ragen services use
  `https://raw.githubusercontent.com/webamigos/RagenAI/main/apps/web/public/icon.png`;
  Docling and Qdrant the same icons as on `demo`. A service's `icon` is a URL.

## 3. Variables per service

References use Railway's syntax: `${{service.VARIABLE}}`, and
`${{service.RAILWAY_PRIVATE_DOMAIN}}` for the internal hostname. `secret(n, "…")`
is a template function, evaluated once at deploy time. Where one secret must be
identical in two services, **generate it in one and reference it from the
other** — never generate it twice.

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
| `STORAGE_PROVIDER` + `S3_*` | `s3` and the bucket references (section 5) |
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
| `OPENROUTER_API_KEY`, the five model variables, `VECTOR_SIZE`, `STORAGE_PROVIDER`, `S3_*` | `${{web.<same name>}}` |

`api` refuses to boot in a deployed `TARGET_ENV` without `INTERNAL_API_SECRET`
and `QDRANT_URL`, and without `REDIS_URL` under BullMQ.

### `worker`

| Variable | Value |
|---|---|
| `TARGET_ENV` | `production` |
| `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL` | as `web` |
| `RAGEN_APP_URL` | `http://${{web.RAILWAY_PRIVATE_DOMAIN}}:3000` |
| `DOCLING_URL` | `http://${{docling.RAILWAY_PRIVATE_DOMAIN}}:5001` |
| `DOCUMENT_PARSER` | `docling` |
| `SECRET_KEY`, `WORKER_SECRET_KEY` | `${{web.<same name>}}` — **required**: the worker decrypts stored API keys with `SECRET_KEY` and refuses to boot without it |
| `ENCRYPTION_PROVIDER`, `ENCRYPTION_MASTER_KEY` | `local`, `${{web.ENCRYPTION_MASTER_KEY}}` |
| `OPENROUTER_API_KEY`, model variables, `VECTOR_SIZE`, `STORAGE_PROVIDER`, `S3_*` | `${{web.<same name>}}` |

The worker takes the **same** encryption key and the same storage as `web` and
`api`, or it writes documents the app cannot read or decrypt (ADR-27).

### `admin`

| Variable | Value |
|---|---|
| `PORT` | `3200` |
| `TARGET_ENV` | `production` |
| `DATABASE_URL` | `${{postgres.DATABASE_URL}}` |
| `BETTER_AUTH_SECRET` | HEX64 — **its own**, not `web`'s (the panel is a separate Better Auth instance, as `create-ragen-app` sets it up) |
| `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` — also what makes the panel's own origin trusted at sign-in (`apps/admin/src/lib/auth-origins.ts`); without it a production build answers "Invalid origin" |
| `RAGEN_APP_URL` | `http://${{web.RAILWAY_PRIVATE_DOMAIN}}:3000` — invitations and guardrail trials post to `web` |
| `INTERNAL_API_SECRET` | `${{web.INTERNAL_API_SECRET}}` |
| `RAGEN_TOKEN_VAULT_URL`, `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | as `web` |
| `OPENROUTER_API_KEY` | `${{web.OPENROUTER_API_KEY}}` — the Models page shows what the gateway can serve |

Only platform administrators (`User.role = 'admin'`) get in. The first account
created on `web` is one: the sign-up screen says so ("Konto utworzone tutaj
staje się administratorem platformy").

### `vault`

| Variable | Value |
|---|---|
| `PORT` | `3100` |
| `HOST` | `::` — dual-stack, for the private network |
| `NODE_ENV` | `production` |
| `TARGET_ENV` | `production` |
| `DATABASE_URL` | `${{postgres-token-vault.DATABASE_URL}}` |
| `ENCRYPTION_KEY` | HEX64 — **the vault's own key**, unrelated to `ENCRYPTION_MASTER_KEY` |
| `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | HEX64 — generated here, referenced by `web`, `api`, `admin` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | optional, empty; only for Google connectors |

Settings: **pre-deploy command `npx prisma migrate deploy`**. The image's `CMD`
does not migrate; without it the vault boots on an empty schema.

### `mcp`

| Variable | Value |
|---|---|
| `PORT` | `3300` |
| `TARGET_ENV` | `production` |
| `RAGEN_API_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001` |
| `MCP_OAUTH_ENABLED` | `false` |

With OAuth off, callers send their own Ragen API key, which `api` validates
against the vault; `mcp` serves `/mcp` and `/health` on its one routed port. To
turn on sign-in with OAuth, set `MCP_OAUTH_ENABLED=true` on `mcp`, `api` and
`web`, and give `mcp` `BETTER_AUTH_URL` (`web`'s public HTTPS origin, no path)
and `MCP_SERVICE_SECRET` (`${{web.MCP_SERVICE_SECRET}}`) — see
[`2026-10-05-mcp-sign-in-with-oauth.md`](specs/2026-10-05-mcp-sign-in-with-oauth.md).

### `migrate`

| Variable | Value |
|---|---|
| `TARGET_ENV` | `production` |
| `DATABASE_URL` | `${{postgres.DATABASE_URL}}` |
| `RAGEN_DEFAULT_FEATURES` | `brain` |

It applies the Prisma migrations and the seed, then exits — a one-shot, so its
restart policy is **Never**. The seed writes `RAGEN_DEFAULT_FEATURES` into the
platform feature defaults where nothing has decided them yet: Brain is on from
the first boot, an administrator who later turns it off is not overruled by the
next deploy, and a misspelt key fails the deploy with its name (#1620).

### `docling`

| Variable | Value |
|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `infra/docling/Dockerfile` |
| `PORT` | `5001` — the forwarder listens here, Docling itself on `PORT + 1` |
| `DOCLING_SERVE_ENABLE_UI` | `false` — the image defaults it to `true`, and this is not a public service |

### Datastores

| Service | Variables |
|---|---|
| `postgres`, `postgres-token-vault` | Railway's own (`DATABASE_URL` is what everything references) |
| `redis` | Railway's own `REDIS_URL` |
| `qdrant` | none — it stays private (section 2) |

## 4. The secrets, in one place

| Secret | Generated in | Referenced from |
|---|---|---|
| `ENCRYPTION_MASTER_KEY` | `web` | `api`, `worker` |
| `SECRET_KEY`, `WORKER_SECRET_KEY` | `web` | `api`, `worker` |
| `SESSION_AUTH_SECRET`, `INTERNAL_API_SECRET`, `MCP_SERVICE_SECRET` | `web` | `api` (`INTERNAL_API_SECRET` also `admin`) |
| `BETTER_AUTH_SECRET`, `PUBLIC_LINK_TOKEN_SECRET` | `web` | — |
| `BETTER_AUTH_SECRET` (the panel's) | `admin` | — |
| `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | `vault` | `web`, `api`, `admin` |
| `ENCRYPTION_KEY` | `vault` | — |

This is the list `create-ragen-app` generates for a local install
(`manifest.ts`), plus the vault's pair. **`ENCRYPTION_MASTER_KEY` is the one
that cannot be regenerated:** thread messages are encrypted under it, and a new
value makes the existing ones unreadable. `local` is also the weakest provider
(ADR-02) — a key in an environment variable, held by every service that reads
messages. A deployment that needs a KMS sets `ENCRYPTION_PROVIDER` and its
credentials instead.

## 5. Object storage

Railway volumes belong to **one** service, and the `local` storage provider
needs one shared by `web`, `api` and `worker` (ADR-27). The template uses a
**Railway Bucket** (S3-compatible, on Tigris), added from the canvas's *Add →
Bucket*. Railway names it (the test project's was `roomy-tray`), and the
references use that name:

| Variable on `web` | Value |
|---|---|
| `STORAGE_PROVIDER` | `s3` |
| `S3_BUCKET_NAME` | `${{<bucket>.BUCKET}}` |
| `S3_REGION` | `${{<bucket>.REGION}}` — it resolves to a region code (`ams`), not the `auto` Railway's documentation shows; either works |
| `S3_ACCESS_KEY_ID` | `${{<bucket>.ACCESS_KEY_ID}}` |
| `S3_SECRET_ACCESS_KEY` | `${{<bucket>.SECRET_ACCESS_KEY}}` |
| `S3_ENDPOINT_URL` | `${{<bucket>.ENDPOINT}}` (`https://t3.storageapi.dev`) |
| `S3_FORCE_PATH_STYLE` | unset — buckets use virtual-hosted style, and uploads, downloads and ingest worked that way |

`api` and `worker` reference `web`'s six. A bucket is reachable **only over
public networking**, so storage traffic leaves the private network; bucket
egress is free, a service's own egress is not.

## 6. What the test deploy proved, and what is open

**Proved on `ragen-template-test`:**

- Every service boots from the variables above, and `migrate` completes. Not
  proved: that a cold start needs no manual step — the test redeployed several
  services by hand for unrelated reasons, so the first `generate from project`
  deploy has to show it.
- The vault's pre-deploy command runs `prisma migrate deploy` before start.
- The private network: `web`, `api`, `worker` reach `qdrant`, `redis`,
  `vault` and `docling` at `*.railway.internal`, including Docling's
  dual-stack forwarder.
- A PDF uploads to the bucket, Docling parses it (the worker logged "Parsed …
  with Docling" from `docling.railway.internal:5001`, not the fallback parser),
  OpenRouter embeds it and Qdrant stores it.
- The model picker offers only what the gateway can serve with the configured
  key (Claude Sonnet 5.5 via OpenRouter).
- On 2.52.0: `migrate` logged "RAGEN_DEFAULT_FEATURES: switched on brain." and
  Brain was in the sidebar on first sign-in; a chat answer on Sonnet 5.5 cited
  the PDF correctly, with the document summary (Haiku 5.5) beside the source;
  a Brain extraction through OpenRouter's structured output wrote one
  candidate page ("1 extracted, 0 failed", 2 535 tokens); the admin panel
  signed in with the first account.

**Found and fixed on the way** — all in 2.52.0 or the PRs named:

- the setup checklist demanded `OPENAI_API_KEY`, recommended Temporal on a
  BullMQ install and showed a raw message key (#1618);
- every chat turn failed with "Brak klucza API" on an install without an
  OpenAI key (#1619);
- Brain could not be on at install (#1620);
- a new chat preselected `gemini-3-flash-preview` instead of `DEFAULT_MODEL`
  (#1622, after 2.52.0 — on 2.52.0 the picker still opens on Gemini);
- `main`'s build failed intermittently on Google Fonts (#1617).

**Still to do before publishing:**

1. *Generate Template from Project*, and check what the composer carries over —
   the bucket, the pre-deploy command, restart policies, healthchecks, groups,
   icons — then replace every generated secret with a `secret()` function and
   `OPENROUTER_API_KEY` with a prompted variable.
2. Pin Docling's repository source to a release tag (`…/tree/v2.52.0`) if the
   composer accepts one.
3. Measure idle memory and cost; Docling dominates both.

**What *Generate Template from Project* dropped** (template `QufTr4`,
2026-10-09) — check each of these after regenerating:

- **Group membership.** The groups came across empty, so a deploy from the
  template put every service loose on the canvas. Membership is set in the
  composer (right-click a service → *Group*) and stored in the template's
  `canvasConfig.groupRefs`, not in `serializedConfig`. A bucket cannot be
  grouped there; it sits beside *Storage*.
- **Literal variable values** came across blank and had to be re-entered;
  generated secrets became `${{secret(64, "abcdef0123456789")}}`.

The pre-deploy command, restart policies and healthchecks did come across.
Redis and Qdrant pull from Docker Hub, so a Docker Hub incident fails a fresh
deploy of the template even when every Ragen image (GHCR) pulls fine.

**Qdrant needs `PORT=6333`.** Railway's healthcheck probes `PORT`, and without
one it probes a port of its own choosing; Qdrant listens on 6333 regardless, so
`/readyz` failed for the full five-minute window on a Qdrant that had started
cleanly. The source project never set it either, so the template could not carry it;
the first fresh deploy from the template was the first to fail.

**Rebuilding the project by hand, not from the template** — two traps the test
hit, which a template avoids because it creates every service at once:

- A reference to a service that does not exist yet resolves to an empty string
  **and stays empty** after the service is created — `RAGEN_API_INTERNAL_URL`
  became `http://:3001`, and `web` failed every call to `api` with "Invalid
  URL". Create all services first, set references last, and grep for `://:` or
  `:///`.
- The Railway CLI (4.11) created a Redis service with no instance in the
  environment, twice; deleting it later emptied every `REDIS_URL` that
  referenced it. Add Redis from the dashboard.

## 7. The overview page

Railway asks a published template for a fixed shape (H1 "Deploy and Host Ragen
with Railway", *About*, *Common use cases*, *Dependencies*, *Why deploy on
Railway*). Beyond that, it should state what a deployer would otherwise
discover by accident:

- the one value to enter, and where to get it;
- that **PII masking** and **content moderation** are off, and what turns each on;
- that `ENCRYPTION_MASTER_KEY` must be backed up, because nothing can recover it;
- that the first account created becomes the platform administrator, and that
  the template ships no demo credentials;
- that mail is not configured: verification links and invitations go to the
  log until `RESEND_API_KEY` or `SMTP_*` is set.

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

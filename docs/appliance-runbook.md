# Appliance runbook

How to install, check, back up, upgrade, roll back and repair Ragen running
as an on-premises appliance: one machine, its models served by a local
Ollama, and nothing leaving the building. It is step C4 of
[the appliance spec](specs/2026-10-17-ragen-as-an-on-premises-appliance.md),
and it describes what exists on `main` today. Where a step is not built yet,
this page says so and names the spec step that will build it.

| Section | State |
| --- | --- |
| [Install](#1-install) | written; the manual path. The installer option is coming (C1) |
| [Prove nothing leaves the machine](#2-prove-nothing-leaves-the-machine) | written |
| [Back up](#3-back-up) and [restore](#4-restore) | written |
| [Upgrade, online](#5-upgrade-online) | written |
| [Upgrade, offline](#6-upgrade-offline) | placeholder until C2 |
| [Roll back](#7-roll-back) | written |
| [Swap a model](#8-swap-a-model) (with re-index) | written |
| [Troubleshooting](#9-troubleshooting) | written, one entry per failure mode in the spec |
| [First-line checklist](#10-first-line-checklist-draft) | draft. The support roles arrive with C3 |

## Conventions

- **The checkout lives at `/opt/ragen`**, and every command below is run from
  there. The env template's `LLM_ROUTES_PATH` already assumes that path.
- **The four compose files are named once**, in Compose's own `.env` file
  (step 1.3), through `COMPOSE_FILE`. After that a plain `docker compose ps`
  means the appliance stack. Without that line, every `docker compose`
  command below needs
  `-f docker-compose.yml -f docker-compose.fullapp.yml -f docker-compose.appliance.yml`
  (and `-f docker-compose.appliance.gpu.yml` on a GPU machine).
- **Two env files, two readers.** `.env` is read by Compose, for
  interpolation: `COMPOSE_FILE`, `COMPOSE_PROJECT_NAME`, `RAGEN_VERSION`,
  ports, the RustFS keys. `.env.local` is passed into web, api, worker and the
  migrate job. Compose's `environment:` blocks win over `.env.local`, which is
  how the database, Redis, Qdrant and model-server addresses become service
  names inside the containers.
- Container and volume names are prefixed with the Compose project name,
  `<project>-postgres-1` and `<project>_postgres_data`. Use service names
  with `docker compose`, not container names
  ([why](lessons/pinned-compose-names-make-two-installs-share-one-database.md)).

## 1. Install

`create-ragen-app` is getting an "appliance" option that asks local or hybrid
and the tier, and writes the profile, the route file and the env (spec step
C1, in progress). Until it lands, the install is the manual path below. It is
the path [`infra/appliance/README.md`](../infra/appliance/README.md)
describes, and that the Phase 0 demo and the A3 egress check run.

### 1.1 What the machine needs

- Linux, with Docker Engine and **Docker Compose 2.24 or newer**.
  `docker-compose.fullapp.yml` uses the `env_file: path:` form.
- For a GPU: the NVIDIA driver and the NVIDIA Container Toolkit. Without a
  GPU the stack runs on the CPU, slowly.
- Disk: about 20 GB for the default models, plus the images, plus documents.
- `git`. Node `^24.15.0` and `npm ci` are needed only for the npm scripts in
  this runbook (`appliance:egress-check`, `gateway:preflight`). The stack
  itself runs entirely in containers.
- Internet **once**, for the image pull and the first model pull. An install
  with no network at all needs the offline bundle (C2), which does not exist
  yet.

Sizing per tier is not published. The tier table in the spec is a placeholder
until A5 measures it on real hardware, and no tier is offered before then.

### 1.2 Get the release

```bash
git clone https://github.com/webamigos/RagenAI.git /opt/ragen
cd /opt/ragen
git checkout v<X.Y.Z>
```

Releases are tagged `v<X.Y.Z>` in the repository, and each image is tagged
`<X.Y.Z>`, `<X.Y>`, `sha-<commit>` and `latest`. Keep the checkout and the
images on the same release. The compose files, the route tables and the
Ollama image tag come from the checkout, and the applications come from the
images.

### 1.3 Write the environment

```bash
cp infra/appliance/appliance.env.example .env.local
```

Fill in every empty secret. The template names the command that generates
one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- `ENCRYPTION_MASTER_KEY` encrypts every thread message. **If it is lost,
  every message is lost**, so it goes into every backup (section 3).
- The model names, `VECTOR_SIZE=1024`, `DOCLING_STRICT=1` and
  `STORAGE_PROVIDER=local` are already set. Leave a URL variable unset rather
  than empty: an empty one fails validation (Phase 0, failure 2).
- Delete any per-app `apps/*/.env.local` on this machine. An appliance has
  one environment, and a per-app file silently overrides it (Phase 0,
  failure 1).

Then Compose's `.env`:

```bash
cat > .env <<'EOF'
COMPOSE_FILE=docker-compose.yml:docker-compose.fullapp.yml:docker-compose.appliance.yml
COMPOSE_PROJECT_NAME=ragen
RAGEN_VERSION=<X.Y.Z>
POSTGRES_PASSWORD=<a generated password>
EOF
```

On a GPU machine, append `:docker-compose.appliance.gpu.yml` to
`COMPOSE_FILE`. Set `POSTGRES_PASSWORD` before the first start, because
Postgres reads it only when it creates its volume. Every app's
`DATABASE_URL` is built from the same variable.

Five things the template does not do yet:

- **PII masking is off in the container stack.** The template sets
  `FEATURE_FLAG_PII_MASKING=1` and the Presidio URLs for apps run on the host.
  In containers, `docker-compose.fullapp.yml` overrides web's and the
  worker's values with the ones from `.env`, which are empty by default.
  api keeps the template's `localhost` URLs, which point at nothing inside
  its container. To turn masking on, put these in `.env` and start with
  `--profile pii` (or add `COMPOSE_PROFILES=pii` to `.env`):

  ```bash
  FEATURE_FLAG_PII_MASKING=1
  PRESIDIO_ANALYZER_URL=http://presidio-analyzer:3000
  PRESIDIO_ANONYMIZER_URL=http://presidio-anonymizer:3000
  ```

  The analyzer is built locally from `infra/presidio/analyzer`, so the first
  start with the profile builds an image. The egress check runs with masking
  off, so this path is not covered by it.
- **web's public address is fixed to `http://localhost:3000`** in the
  container stack. `docker-compose.fullapp.yml` sets `APP_URL` for web
  itself, and that wins over `.env.local`. An install reached by a hostname
  needs that line changed. Until then, invitation links and the OIDC
  callback name `localhost`.
- **No TLS.** web (3000), api (3001) and admin (3200) are published on every
  interface; the backing services on loopback only. Put the organization's
  own reverse proxy with its certificate in front of web.
- **apps/admin reads `apps/admin/.env.local`** in this stack, not the root
  file, and the template does not cover it.
- **Nightly schedules are not created.** Analytics pruning and the personal
  memory purge are BullMQ schedules made by scripts in
  `apps/worker/src/scripts/ensure-*-schedule.ts`, run once per environment.
  Nothing runs them on an appliance.

### 1.4 Start

```bash
docker compose up -d
docker compose ps -a
```

The first start pulls the images, then `ollama-models` pulls the models into
the `ollama_models` volume. That pull is the step that takes long. web, api
and worker wait for it and for the `migrate` job, which applies the database
migrations and seeds the plans and the connector catalogue. In
`docker compose ps -a` both one-shots should show `Exited (0)`, and every
other service `running` (`healthy` where it has a health check).

### 1.5 The first account

Open `http://<host>:3000`. A new install asks for its first account, which
becomes the platform administrator. If the page shows a setup checklist
instead, it says what is missing (section 9 lists every finding).

### 1.6 Company sign-in (optional)

Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
`OIDC_ALLOWED_DOMAINS` in `.env.local`, and register
`<APP_URL>/api/auth/callback/oidc` with the issuer. `OIDC_JOIN_ORGANIZATION`
makes new SSO users members of one organization. For Entra ID, which sends
no `email_verified`, `OIDC_TRUST_EMAIL=true` says the tenant owns the
domains. The root `.env.example` documents each variable. A partial set turns
SSO off and appears on the setup checklist as `oidc-misconfigured`. Password
sign-in keeps working either way.

```bash
docker compose up -d web
```

Two things to know:

- A self-hosted issuer such as Keycloak must be up before Ragen. Better Auth
  reads the discovery document once.
- The callback names `APP_URL`, which in the container stack is still
  `localhost` (see 1.3).

### 1.7 Check it

1. The sign-in page shows no setup checklist, or only `recommended` findings
   you have decided to accept.
2. Upload a document under Knowledge, wait for it to finish, and ask a
   question about it. The answer should cite it.
3. The model picker offers the local models by name (Bielik 11B, Qwen 2.5 7B,
   Gemma 3 12B).
4. Optionally, from a host with Node and `npm ci` done, make one real call
   per configured model:

   ```bash
   npm run gateway:preflight -- --probe
   ```

   It reads `.env.local`, so it uses the host values in the template:
   Ollama on `localhost:11434` and the route table at `/opt/ragen/...`.

## 2. Prove nothing leaves the machine

```bash
npm run appliance:egress-check -- --version <X.Y.Z>
```

This brings the appliance up on a Compose network with no route out
(`docker-compose.appliance.sealed.yml`), signs up an account, ingests one
document and asks one question about it. tcpdump on the network's bridge
sees every packet not addressed to another container. If any container
tried to leave, the check fails and names the container and the host. A
canary that must be seen guards against a capture that sees nothing.

What it does and does not prove:

- **It proves the release and the configuration, not the running install.**
  It runs its own stack, from a temporary directory with an environment
  generated from `appliance.env.example`, in its own Compose project
  (`ragen-egress-check`) on random ports. The install's `.env.local` and
  volumes are not touched. Run it before delivery, after an upgrade and
  after adding a service.
- **By default it swaps the models for `qwen2.5:0.5b` and `all-minilm`.**
  `--full-models` runs the checkout's real route table, which needs the
  hardware. Both share the machine's GPU and memory with a running install.
- **It needs the internet before it seals the network**: to build its tools
  image and to pull its models. Its model volume is kept, so a second run
  pulls nothing.
- **Docker 24 is verified.** On Docker 26 and later an internal network's
  resolver may stop forwarding names, and the canary will fail the run
  rather than pass it.
- **Not covered yet** (A3b): Brain, the guardrail first pass, PII masking,
  and the hybrid profile. `--profile hybrid` is refused because the profile
  does not exist.
- `--keep` leaves its stack running for a look around.

## 3. Back up

### What a backup set is

| Item | Where it lives | Why |
| --- | --- | --- |
| Postgres | `postgres_data` volume | users, organizations, documents' metadata and versions, threads (encrypted), audit log |
| Qdrant | `qdrant_data` volume, one collection per organization (named by its id) | the search index: chunks, vectors, and published Brain pages |
| Documents | `storage_data` volume (`STORAGE_PROVIDER=local`), or the S3 bucket | the original uploads |
| `.env.local` | the checkout | **`ENCRYPTION_MASTER_KEY`**: without it the backed-up messages cannot be read. Also every other secret |
| `.env` | the checkout | the project name, the release, the Postgres password, RustFS keys |
| Local edits | the checkout, mostly `infra/llm-gateway/routes.appliance.yaml` | a model swap is an edit to a tracked file; `git diff` shows it |
| Ollama models | `ollama_models` volume | optional. With the internet they are pulled again. Without it, this volume is the only copy |

Redis is not backed up. It holds the job queues and caches. A restore loses
the jobs that were queued at the time (see section 4).

**The three data stores are one set.** Restoring Postgres from Monday and
Qdrant from Wednesday gives files without vectors, or vectors for files that
no longer exist. Take all three in the same window, with the writers stopped.

### Procedure

```bash
B=/var/backups/ragen/$(date +%Y%m%d-%H%M)
mkdir -p "$B/qdrant"

# 1. Stop the writers. Postgres, Qdrant and Ollama keep running.
docker compose stop web api worker admin

# 2. Postgres, in pg_dump's custom format
docker compose exec -T postgres pg_dump -U postgres -d ragen -Fc > "$B/postgres.dump"

# 3. Qdrant: one snapshot per collection, downloaded, then deleted on the server
for c in $(curl -fsS http://localhost:6333/collections | grep -o '"name":"[^"]*"' | cut -d'"' -f4); do
  snap=$(curl -fsS -X POST "http://localhost:6333/collections/$c/snapshots" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  curl -fsS "http://localhost:6333/collections/$c/snapshots/$snap" -o "$B/qdrant/$c.snapshot"
  curl -fsS -X DELETE "http://localhost:6333/collections/$c/snapshots/$snap" > /dev/null
done

# 4. Documents on the local volume, read through the worker image
docker compose run --rm --no-deps -T --user root --entrypoint tar worker \
  -C /data/storage -cf - . > "$B/storage.tar"

# 5. Configuration
cp .env.local .env "$B/"
git diff > "$B/local-changes.diff"

# 6. Writers back
docker compose start web api worker admin
```

Notes:

- Use your own `POSTGRES_USER` or `POSTGRES_DB` if you changed them in `.env`.
- Qdrant's port is published on `127.0.0.1:6333`. With `QDRANT_API_KEY` set,
  add `-H "api-key: $QDRANT_API_KEY"` to each `curl`. Qdrant writes a
  snapshot inside its container (`/qdrant/snapshots`, not the volume), so
  step 3 deletes each one once it is downloaded.
- Step 4 uses the worker image because it is always present on the machine
  and has `tar`. `--no-deps` keeps it from starting anything else.
- **Storage in RustFS** (`STORAGE_PROVIDER=s3`, `--profile s3`): copy the
  bucket with the `aws` CLI in the `rustfs-bucket-init` image, which already
  has the RustFS keys:

  ```bash
  docker compose --profile s3 run --rm --no-deps -v "$B/storage:/backup" \
    --entrypoint aws rustfs-bucket-init \
    --endpoint-url http://rustfs:9000 s3 sync s3://ragen /backup
  ```

  Use your `S3_BUCKET_NAME` if it is not `ragen`. To restore, run the same
  command with `/backup s3://ragen` in that order. For the organization's own
  S3, use its own backup and versioning.
- `$B` holds `ENCRYPTION_MASTER_KEY` next to the encrypted messages. Keep the
  backup target as protected as the machine, or store `.env.local`
  separately.
- Nothing in the repository schedules this. A backup script and a timer are
  not built yet.

## 4. Restore

Restore one complete set, all three stores, onto the same release it was
taken from (`RAGEN_VERSION` in the saved `.env`). Restoring onto a newer
release is an upgrade: the `migrate` job brings the schema forward. Restoring
onto an older one is not supported.

```bash
B=/var/backups/ragen/<set>

# 0. On a new machine: section 1.2 at the same release, then
cp "$B/.env.local" "$B/.env" .
git apply "$B/local-changes.diff"      # if it is not empty

# 1. Data services only
docker compose up -d postgres qdrant redis
docker compose stop web api worker admin

# 2. Postgres: replace the database
docker compose exec -T postgres dropdb -U postgres --if-exists --force ragen
docker compose exec -T postgres createdb -U postgres ragen
docker compose exec -T postgres pg_restore -U postgres -d ragen --no-owner < "$B/postgres.dump"

# 3. Qdrant: each upload creates the collection, or replaces it
for f in "$B"/qdrant/*.snapshot; do
  c=$(basename "$f" .snapshot)
  curl -fsS -X POST "http://localhost:6333/collections/$c/snapshots/upload?priority=snapshot" \
    -F "snapshot=@$f" > /dev/null
done
# A collection that is not in the set (an organization created after the
# backup) is left as it is. List them with the curl in section 3 and delete
# any you do not want.

# 4. Documents on the local volume (for RustFS, see section 3's notes)
docker compose run --rm --no-deps -T --user root --entrypoint sh worker \
  -c 'find /data/storage -mindepth 1 -delete && tar -C /data/storage -xf -' < "$B/storage.tar"

# 5. Everything
docker compose up -d
```

Then check the setup checklist, open a thread from before the backup (it
decrypts only with the backup's `ENCRYPTION_MASTER_KEY`), and ask a question
about a document.

**Documents that were mid-ingest at backup time** come back with an
in-progress status and no job behind it, because the job was in Redis.
Select them in Knowledge and choose **Reprocess**.

On a new machine with no internet, the models must come with the set
(the `ollama_models` volume) or with the offline bundle (C2). Otherwise
`ollama-models` cannot finish, and the apps wait for it.

## 5. Upgrade, online

Every release runs its migrations itself. Upgrading is a matter of moving the
checkout and the image tag together.

1. **Read what changed.**

   ```bash
   git fetch --tags
   git log --oneline v<OLD>..v<NEW>
   git diff --stat v<OLD> v<NEW> -- prisma/migrations
   git diff v<OLD> v<NEW> -- infra/appliance docker-compose.appliance.yml infra/llm-gateway/routes.appliance.yaml
   ```

   A new variable in `appliance.env.example` goes into `.env.local` before
   the start. Read every new migration with section 7's rule in mind: a
   release whose migrations are not additive cannot be rolled back without a
   restore.
2. **Back up** (section 3). This is the set a failed upgrade restores.
3. **Move the checkout.** `git status` shows any local edits; a model swap
   edits `routes.appliance.yaml`. Save them, put the files back, move, and
   re-apply:

   ```bash
   git diff > ../local-changes.diff
   git checkout -- .
   git checkout v<NEW>
   git apply ../local-changes.diff   # skip if empty; on a conflict, redo the edit by hand
   ```

4. **Move the images.** Set `RAGEN_VERSION=<NEW>` in `.env`, then:

   ```bash
   docker compose pull
   docker compose up -d
   ```

   `migrate` runs first and the apps wait for it to succeed. A new Ollama
   tag in the overlay is pulled too. A model list changed by the release is
   pulled by `ollama-models`, unless `.env` sets `APPLIANCE_MODELS`, which
   then wins over the release's list.
5. **Check.**
   - `docker compose ps -a`: `migrate` exited 0.
   - `docker compose logs migrate`: the migrations it applied.
   - Section 1.7.
6. **Re-run the egress check** for the new release (section 2).

If the migrate job fails, the apps do not start, and the database is where
the failed migration left it. Do not run `prisma migrate reset`. Keep the
logs, and either roll back (section 7) or escalate.

## 6. Upgrade, offline

**Not built yet; spec step C2.** The offline bundle will carry the release's
images as a tarball, a pre-seeded basal volume, the default tier's model
weights and a checksum manifest. It will install and upgrade with no
network, run migrations first (the `ragen-migrate` image), and carry the
previous image tags so that going back means re-tagging and restarting. This
section will hold its procedure once C2 lands.

Until then, an upgrade needs the internet for `docker compose pull` and for
any new model.

## 7. Roll back

**The rule: every migration is additive, so the previous release runs on the
newer schema.** The spec makes this a requirement for every migration in the
appliance programme. Rollback depends on it, and Prisma has no down
migrations.

- **Additive:** a new table, a new nullable column, a new column with a
  default, a new index.
- **Not additive:**
  - dropping or renaming a column or table;
  - making a column `NOT NULL` without a default, so the older app's inserts
    fail;
  - **adding an enum value.** The older Prisma client throws on reading a row
    that holds the new value
    ([lesson](lessons/adding-an-enum-value-breaks-older-readers.md)). Adding
    the value is harmless; the rollback breaks once the new release has
    written a row with it.

If the release's migrations (`git diff --stat v<OLD> v<NEW> -- prisma/migrations`)
are all additive:

```bash
git checkout v<OLD>
# RAGEN_VERSION=<OLD> in .env
docker compose up -d
```

The older `migrate` job then finds migrations in the database that its own
directory does not have. This path has not been exercised on an appliance
yet. Check `docker compose logs migrate`. If it fails, stop there and
escalate. Do not reset.

If they are not additive, or the rollback above fails, restore the backup
taken before the upgrade (section 4) at the old release. Everything written
since the upgrade is lost, which is why section 5 takes that backup.

A route-table or model change is rolled back with `git checkout --` on the
file (or the saved diff), then a restart (section 8).

## 8. Swap a model

Each model is named in up to three places, which must agree:

- the `model:` in `infra/llm-gateway/routes.appliance.yaml`, **on every route
  that uses it**. The table aliases the cloud ids the application hardcodes
  onto the same local models, so one tag appears on several routes:

  ```bash
  grep -n "model:" infra/llm-gateway/routes.appliance.yaml
  ```

- the pull list, `APPLIANCE_MODELS`. Set it in `.env`; the overlay uses
  `${APPLIANCE_MODELS:-…}`, so `.env` wins over the default in
  `docker-compose.appliance.yml`;
- for the embedding model only, `VECTOR_SIZE` in `.env.local`.

The route ids (`local-chat`, `local-small`, `local-vision`, `local-embed`) and
the env's model names stay as they are. Update `display:` when the model's
name changes, so the picker and the thread header name it correctly.

### 8.1 A chat-class model (chat, small, vision)

No re-index is needed.

```bash
# after editing the route table and APPLIANCE_MODELS in .env
docker compose up -d ollama-models     # pulls what is missing; needs the internet
docker compose restart web api worker  # re-reads the route table
docker compose exec ollama ollama list
```

The setup checklist's `model-not-pulled` finding clears, and the picker shows
the new name. A model the server does not have is hidden from the picker
(A2d). Free the old model's disk with
`docker compose exec ollama ollama rm <old tag>` once nothing routes to it.

Answer quality on the new model is not checked by anything here. The
retrieval eval (ADR-20, [`evals/`](../apps/web/evals/README.md)) is the
measurement, and A5 runs it per tier.

### 8.2 The embedding model: a full re-index

**Any change to the embedding model means re-indexing every document in
every organization, even when the dimension stays the same.** Vectors from
two models are not comparable. With the same size, nothing errors; search
quietly returns the wrong passages. With a different size, Qdrant rejects
every write and every query.

The setup check `embeddings-dimension-mismatch` will not catch either case
on an appliance. It knows only the sizes of the cloud default and of
`cohere-embed-multilingual-v3`, and the appliance keeps `EMBEDDINGS_MODEL`
as the route id `local-embed` whatever model sits behind it. Updating that
check is a known gap (spec, Failure modes).

Do it in a maintenance window. Until a document is re-indexed, search does
not find it.

1. **Back up** (section 3). The Qdrant snapshots are how you go back.
2. **Change the model**: `model:` on `local-embed`, `APPLIANCE_MODELS` in
   `.env`, and `VECTOR_SIZE` in `.env.local` to the new model's dimension
   (`bge-m3` is 1024). Then pull it:

   ```bash
   docker compose up -d ollama-models
   ```

3. **Stop the apps, then delete the old collections.** web, api and worker
   each remember for the life of the process which collections they have
   seen. Deleting one under a running worker leaves it writing to a
   collection it believes exists. Stopped first, they create each collection
   again at the new size on first use.

   ```bash
   docker compose stop web api worker
   for c in $(curl -fsS http://localhost:6333/collections | grep -o '"name":"[^"]*"' | cut -d'"' -f4); do
     curl -fsS -X DELETE "http://localhost:6333/collections/$c" > /dev/null
   done
   docker compose up -d
   ```

4. **Re-ingest every document.** In each organization, an owner or admin
   opens Knowledge, selects the files and chooses **Reprocess**. The list
   shows a page of files at a time, so work through each folder and page
   until every file has been sent. For each file, Reprocess picks the
   correct job:
   - a file whose active version is the upload goes through
     `runFileEmbeddings`, which parses the stored file again;
   - a file whose active version is an edit, an optimization or a rollback
     goes through `reindexDocumentVersion` (`Workflow.REINDEX_DOCUMENT_VERSION`),
     which embeds the version's text.

   Never re-ingest an edited document with `runFileEmbeddings` alone: the
   stored file is still the original upload, and the edit would leave the
   index (AGENTS.md, "Document Versions"). The same choice lives in
   `startFileReindexCommand`, which the bulk action, the single-file action
   and the folder policy change all use.

   The jobs join the normal ingest queue. Each file is parsed by Docling and
   summarized again, so a large knowledge base takes hours.
5. **Check**: the knowledge base shows every file done, and a question about
   an old document finds it.

Not covered by Reprocess, and not yet by anything else:

- **Published Brain pages.** Their chunks are written by publishing, not by
  ingest, and the bulk action skips their files. After step 3 they are not
  in search. Whether re-publishing restores them has not been verified.
- **An operator command.** The contextual-chunks re-index script
  ([runbook](runbooks/contextual-chunks-reindex.md)) finds its files by
  reading Qdrant, so after step 3 it reports nothing to do. No script yet
  re-indexes a whole organization from the database.

To go back: restore the old model, `APPLIANCE_MODELS` and `VECTOR_SIZE`, stop
web, api and worker, upload the Qdrant snapshots from step 1 (section 4,
step 3), and start again.

## 9. Troubleshooting

Each entry follows a failure mode in the spec. The setup checklist on the
sign-in page is the first place to look. It reports these finding ids:

| Finding | Meaning |
| --- | --- |
| `database`, `redis`, `vector-store` | a backing service is unreachable or unset |
| `auth-secret`, `secret-key`, `app-url`, `target-env` | a required setting is missing or invalid |
| `message-encryption` | the encryption provider or key is wrong |
| `default-model`, `model-provider-credentials` | the default model has no route, or its route has no credentials |
| `model-server-unreachable`, `model-not-pulled` | Ollama is down, or a routed model was never pulled (B3) |
| `embeddings-dimension-mismatch` | `VECTOR_SIZE` does not match a known embedding model (see 8.2 for its blind spot) |
| `docling-unavailable` | the worker's last Docling probe failed |
| `oidc-misconfigured` | a partial OIDC configuration; SSO is off |
| `mail`, `moderation`, `object-storage-credentials`, `basal-unavailable`, `temporal` | optional services |

**Local model server down.** The setup checklist shows
`model-server-unreachable`, and chat returns the gateway's "model
unavailable" error. It never falls back to a cloud route, because the
appliance table has none.

```bash
docker compose ps ollama
docker compose logs --since 30m ollama
docker compose restart ollama
```

**A model is missing.** `model-not-pulled` names it. Run
`docker compose exec ollama ollama list`, then `docker compose up -d ollama-models`.
That needs the internet; offline, restore the `ollama_models` volume.

**Answers are slow.** Run `docker compose exec ollama ollama ps`. A model
shown on CPU rather than GPU means the GPU overlay is missing from
`COMPOSE_FILE`, or the toolkit is not installed (`nvidia-smi` on the host).
`OLLAMA_NUM_PARALLEL` (default 4) and `OLLAMA_KEEP_ALIVE` (default 24h) can
be set in `.env`. Whether a machine is big enough for its users is A5's
measurement, which does not exist yet.

**Search finds nothing after a model change, or ingest fails with a vector
dimension error.** The embedding model and the index disagree. See section 8.2.

**A document fails to ingest.** With `DOCLING_STRICT=1`, a Docling failure
is a visible ingest failure, never a cloud call. The worker waits up to 30
minutes for a Docling whose health check does not answer before it spends
its retries.

```bash
docker compose logs --since 30m docling worker
docker compose restart docling
```

Then **Reprocess** the file. A format Docling cannot parse stays failed.

**The hybrid EU endpoint is unreachable.** The hybrid profile does not exist
yet (A1b). When it does, chat will fail with "model unavailable" while
search and ingest keep working. It will not switch to a local model.

**The support channel was left open / the first-line role.** Not built yet
(C3).

**Company sign-in fails although the button is shown.** Better Auth fetches
the issuer's discovery document once, when it starts. If the issuer was
unreachable then, the provider is skipped until a restart:

```bash
docker compose restart web
```

Password sign-in for the local admin account keeps working throughout.

**An upgrade was applied over a running stack.** The `migrate` job runs
before the apps in the online path (section 5). The offline bundle (C2) is
not built.

**The guardrail first pass (basal) has no weights.** basal is not part of
the appliance overlay. Without it the first pass is skipped, and it can only
ever clear a turn, never block one.

**api or the worker keeps restarting.** They refuse to boot without their
secrets or without Redis, and the log names the variable:
`docker compose logs --tail 50 api worker`. The worker also refuses a Redis
whose eviction policy is not `noeviction`, which compose sets.

**The apps never start.** They wait for `migrate` and `ollama-models`. Run
`docker compose ps -a`, then `docker compose logs migrate ollama-models`.

## 10. First-line checklist (draft)

**Draft.** Spec step C3 builds the support channel and its two roles. First
line gets the `apps/admin` web UI only, with a health view, service status,
logs with message content redacted, and a restart from a fixed list (web,
api, worker, Docling, the model server). The maintainer gets SSH. Until C3
exists, there is no first-line role, and these steps need someone on the
machine with a shell. When C3 lands, each step below will move to its admin
equivalent and this section will name the role that runs it.

Work through this in order, and escalate with what you found.

1. **Is everything running?** `docker compose ps -a`. Every service
   `running` (and `healthy` where shown); `migrate` and `ollama-models`
   `Exited (0)`.
2. **What does the setup checklist say?** Open the sign-in page. Note every
   finding id (section 9).
3. **Do the services answer?**

   ```bash
   curl -fsS http://localhost:3000/api/healthcheck
   curl -fsS http://localhost:3001/v1/healthcheck
   curl -fsS http://localhost:5001/health
   curl -fsS http://localhost:6333/healthz
   curl -fsS http://localhost:11434/api/tags
   docker compose exec redis redis-cli ping
   docker compose exec postgres pg_isready -U postgres
   ```

4. **What do the logs say?** `docker compose logs --since 30m <service>`.
   Logs can contain customer content. Copy only the error lines out of the
   machine.
5. **Restart only from this list**, one service at a time, then repeat step
   1:

   ```bash
   docker compose restart web     # or: api, worker, docling, ollama
   ```

   Never restart or remove `postgres`, `qdrant` or `redis`, never run
   `docker compose down -v` (it deletes the volumes), and never edit the env
   files. Those are second-line actions.
6. **Escalate** with:
   - `RAGEN_VERSION` from `.env`;
   - the output of steps 1 and 3;
   - the finding ids from step 2;
   - the error lines from step 4;
   - when it started, and what changed just before.

## Not built yet

Gaps this runbook works around or points at, in one place:

- **The installer's appliance option (C1)** and **the offline bundle (C2)**.
- **The support channel and roles (C3).**
- **A backup script and a schedule** for section 3.
- **An operator command for a full re-index** after an embedding change, and
  a way to re-embed published Brain pages (8.2).
- **`embeddings-dimension-mismatch` on the appliance** cannot see a model
  change behind `local-embed` (8.2).
- **The container stack's PII wiring, `APP_URL`, admin env file, TLS and
  nightly schedules** (1.3).
- **Sizing per tier (A5)**, the vLLM variant, a local reranker and the hybrid
  profile (A1b), and the rest of the egress check (A3b).

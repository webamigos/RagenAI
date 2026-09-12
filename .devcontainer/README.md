# Dev container

A contributor path: open the repository in GitHub Codespaces and get a working
Ragen — the Node this repository pins, the backing services it needs, a
migrated database — without installing anything locally.

It is **not** the maintainers' primary development loop, and it is deliberately
thin. It adds one container (the workspace) and layers the repository's own
`docker-compose.yml` for everything else, so there is no second copy of any
service definition to drift.

## Using it

**Codespaces** — `Code → Codespaces → Create codespace on main`. First
creation takes a few minutes (image pulls, `npm ci`, migrations); resuming an
existing codespace takes seconds. Then:

```bash
npm run web:dev     # http://localhost:3000, auto-forwarded
```

The machine type matters: `devcontainer.json` asks for **4 cores / 16 GB**.
The 2-core tier does not fit Postgres, Qdrant, LiteLLM, Temporal and a
Turbopack dev server at once — it swaps, and every symptom then looks like a
slow app instead of a small machine.

**Locally** (VS Code → _Dev Containers: Reopen in Container_) works too, with
three caveats worth knowing before you spend an hour on it:

- **stop your host stack first** — `npm run ragen:down`. `docker-compose.yml`
  pins container names (`ragen-postgres`, …) and publishes fixed host ports,
  neither of which is namespaced per Compose project, so a stack that is
  already up makes the dev container fail to start: first on a name conflict,
  and once that is resolved, on `Bind for 127.0.0.1:55432 failed: port is
already allocated`. The dev container then owns the same containers and the
  same volumes, so your data is still there;
- it needs roughly 10 GB of Docker disk on top of what a Ragen stack already
  uses — `node_modules` and every build output get their own volume;
- **it does not work from a git worktree.** A worktree's `.git` is a pointer
  holding an absolute host path, which does not exist inside the container.
  Clone the repository normally for this.

None of this applies in a Codespace, where nothing else is running.

## What starts, and what doesn't

`runServices` in `devcontainer.json` starts Postgres, Qdrant, LiteLLM (plus its
own Postgres), Redis and Temporal. Left out on purpose: Docling (~700 MB,
needed only when `DOCUMENT_PARSER=docling`), Presidio (~1 GB, PII masking),
the Temporal UI and the observability profile.

To add one, put it in `runServices` and rebuild the container. The Docker
socket is mounted, so `docker ps`, `docker logs ragen-litellm` and
`docker restart ragen-litellm` work from inside the container — but
`docker compose up` does not: Compose would hand the outer daemon container
paths (`/workspace/infra/...`) that do not exist on the host, and the bind
mounts would come up empty.

## Environment variables

Two layers, and the split is the point:

1. **Container networking** — `DATABASE_URL`, `QDRANT_URL`,
   `LITELLM_PROXY_URL`, `TEMPORAL_SERVER_ADDRESS`, `REDIS_URL` — are real
   environment variables set in `docker-compose.devcontainer.yml`. Real
   environment variables beat every env file (see
   `scripts/load-root-env.mjs`), so nothing has to be rewritten.
2. **Everything else** lives in `.env.local`, which starts as a byte-for-byte
   copy of `.env.example`. `scripts/setup-env.mjs` then fills in the generated
   secrets, reusing create-ragen-app's manifest rather than a second list of
   which keys need one.

`setup-env.mjs` runs again on every rebuild and **never overwrites a value you
set** — after the first run it only fills keys that are still empty. Editing
`.env.local` is safe; it is yours.

Before the first question actually works you need an LLM provider key. Paste it
into `.env.local`, then:

```bash
docker restart ragen-litellm    # the proxy reads .env.local at startup
```

In a Codespace, `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` are pointed at the
forwarded `https://…app.github.dev` host. With the `localhost` defaults sign-in
fails in a way that looks like broken auth rather than a wrong origin.

## Files here

| File                                  |                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devcontainer.json`                   | the whole configuration. Plain JSON, no comments — prose belongs in this README, and a test enforces it                                                                                                                    |
| `docker-compose.devcontainer.yml`     | the workspace service, and nothing else                                                                                                                                                                                    |
| `docker-compose.volumes.yml`          | **generated**, gitignored                                                                                                                                                                                                  |
| `devcontainer-lock.json`              | pins the `docker-outside-of-docker` feature to a version and digest, for the same reason `docker-compose.yml` pins every image. Regenerate by running the container; a test fails if a declared feature is missing from it |
| `scripts/initialize.sh`               | host-side, before the container: regenerates the override, makes sure `.env.local` exists (Compose fails without it — `litellm` declares `env_file`)                                                                       |
| `scripts/generate-compose-volumes.sh` | one named volume per workspace build output, derived from the filesystem so a new package needs no edit here                                                                                                               |
| `scripts/post-create.sh`              | once: chown volumes, `npm ci`, secrets, `prisma migrate deploy`                                                                                                                                                            |
| `scripts/post-start.sh`               | every start: `npm ci` only if the lockfile moved, then migrations                                                                                                                                                          |
| `scripts/setup-env.mjs`               | the secrets step, idempotent                                                                                                                                                                                               |

`tests/architecture/devcontainer-agrees-with-the-repo.test.ts` is what keeps
this directory honest: it fails when a service in `runServices` is renamed,
when `.nvmrc` moves past the image, when a compose reference stops resolving,
or when a new workspace's build output has no volume.

## When something is wrong

- **`prisma migrate deploy` fails after switching branches** — usually a
  migration present in one branch and not the other. `npx prisma migrate
status` says which; the container stays usable either way.
- **A service is unhealthy** — `docker logs ragen-postgres` (names are pinned
  in `docker-compose.yml`, not Compose-prefixed).
- **The model picker is empty right after startup** — LiteLLM takes about 90
  seconds to accept connections and has no healthcheck, so nothing waits for
  it. `docker logs ragen-litellm` shows when it is up.
- **You want a clean database** — stop the container, then
  `docker volume rm ragen-postgres-data ragen-qdrant-data`, then rebuild.
  Those volumes are shared with a host-side `npm run ragen:up:full` stack: the
  names are global to the daemon, so this wipes that one too.

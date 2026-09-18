---
title: 'Pinning container, volume and network names in docker-compose.yml buys readable `docker logs` and costs two installs a shared database'
modules: ['create-ragen-app', 'devcontainer']
areas: ['architecture', 'dependencies']
topics: ['docker-compose', 'project-name', 'volumes', 'first-run', 'installer', 'ports', 'silent-failure']
---

# Pinned compose names make two installs share one database

**Context**: `docker-compose.yml` set `container_name: ${RAGEN_STACK_NAME:-ragen}-postgres`
on every service, a `name:` on every volume and a fixed network name. The stated
reason was readability — `docker logs ragen-postgres` and the runbooks spelling
that name kept working — and it was a deliberate trade, written down in the
file's own header.

**Problem**: those names are global to the Docker daemon, not scoped to the
Compose project. A second Ragen checkout on the same machine therefore:

- failed to start, with `Conflict. The container name "/ragen-qdrant" is already
  in use`; and, once someone worked around that,
- **attached to the first install's postgres and qdrant volumes.** Not a copy —
  the same data. Two installs, one database, and nothing said so: `docker
  compose up` succeeds, the app starts, and the rows are simply someone else's.

Compose warns about the mismatch (`volume "ragen-postgres-data" already exists
but was created for project "ragen-app"`) inside the same wall of output as
everything else it prints.

The escape hatch was `RAGEN_STACK_NAME`, which is a bespoke re-implementation of
`COMPOSE_PROJECT_NAME` — the thing Compose already does, from the directory
name, with no configuration at all.

**Rule**: let Compose name its own resources. `container_name`, a volume `name:`
and a network `name:` each opt one resource out of project scoping, and the
benefit (a readable name) has a replacement that the cost does not: `docker
compose ps` and `docker compose logs <service>` name *services*, work from the
project directory, and are correct in every checkout.

Three things unpinning does **not** settle by itself, all worth stating when
someone proposes it:

- **Compose derives the project name from the directory *basename*, not the
  path.** Left at the default, `/work/a/ragen` and `/work/b/ragen` are one
  project with one set of volumes — the original bug, narrowed to same-named
  directories rather than removed. And that residue is the *quiet* case: a
  stopped first stack holds no port, so the port warning below cannot see it
  either.

  **An install made by `create-ragen-app` is not exposed to this.** It resolves
  a name per absolute path and writes `COMPOSE_PROJECT_NAME` into the install's
  `.env`, which Compose reads from the project directory on every later command
  — so two supported installs stay apart whatever their directories are called,
  and an existing value is never overwritten, because renaming a project
  abandons the volumes holding its database. What remains exposed is a checkout
  made some other way: `git clone` into a directory whose name is already in
  use needs that line added by hand.

  Two things worth keeping from how that was built. The value has to live in a
  file Compose reads by itself — one passed in the installer's own environment
  would name one project during the install and a different one afterwards,
  which is worse than no fix. And when the daemon cannot be reached the name
  falls back to the path-derived one, not the bare basename: a stopped daemon
  still holds the volumes of every earlier install, so the pretty guess fails
  silently and the ugly one fails visibly.
- **Published ports are not prefixed by anything.** Two stacks publishing 55432
  still collide, whoever created them, so a port warning is still needed —
  `create-ragen-app` probes the ports it is about to publish before starting
  the stack.
- **Existing installs come up empty.** The volumes are renamed, not migrated
  (`ragen-postgres-data` → `<project>_postgres_data`). Nothing is deleted, but
  the stack starts blank unless the data is copied across; say so in the release
  note, because "my database is gone" is how it is discovered otherwise.

And one guard: the installer used to detect a second install by looking for the
volume `ragen-postgres-data`. Removing the pin removed the name, which would
have left that check silently answering "clear" forever. **When you delete the
thing a guard looks at, the guard does not fail — it stops firing.** Grep for
readers of any name you unpin.

**Applies to**: `docker-compose.yml`, `docker-compose.app.yml`,
`docker-compose.fullapp.yml`, `.devcontainer/`, and any doc or script spelling a
container name.

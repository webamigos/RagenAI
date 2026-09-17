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

Two things this does **not** fix, both worth stating when someone proposes it:

- **Published ports are not prefixed by anything.** Two stacks publishing 55432
  still collide, so a port warning is still needed — `create-ragen-app` probes
  the ports it is about to publish before starting the stack.
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

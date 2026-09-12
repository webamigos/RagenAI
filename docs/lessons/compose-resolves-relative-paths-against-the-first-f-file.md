---
title: 'A layered Compose file resolves its relative paths against the first -f file, not its own directory'
modules: ['devcontainer', 'ci']
areas: ['architecture']
topics:
  ['docker-compose', 'devcontainer', 'bind-mounts', 'local-development']
---

# A layered Compose file resolves its relative paths against the first -f file, not its own directory

**Context**: adding `.devcontainer/docker-compose.devcontainer.yml`, a one-service
override layered on the repository's own `docker-compose.yml`:

```text
dockerComposeFile: ["../docker-compose.yml", "docker-compose.devcontainer.yml", …]
```

The override mounts the repository into the workspace container. Written from inside
`.devcontainer/`, the obvious spelling is `- ..:/workspace` — go up one level to reach
the repository root, which is exactly what the reference on the line above does.

**Problem**: that mounts the wrong directory. Compose takes the *project directory*
from the first `-f` file and resolves every relative path in every layer against it —
so in the override, `.` already means the repository root and `..` means its parent.
The container would come up with the directory *containing* the repository mounted at
`/workspace`, and the failure is not a Compose error: the container starts, and every
path inside it is off by one level. `docker compose … config` is what settles it —
it prints each bind's resolved absolute `source`, so the mistake is visible before
anything is built.

The same rule is what makes layering work at all in the other direction:
`docker-compose.yml` mounts `./infra/litellm/config.yaml` and
`./infra/temporal/dynamicconfig`, and those keep resolving correctly *only* because
the repository file is listed first. Reorder the list — put the override first
because it feels like "the" devcontainer file — and the project directory becomes
`.devcontainer/`, every `./infra/...` bind silently points at a path that does not
exist, and Compose helpfully creates them as empty directories.

**Rule**: in any Compose file that is layered onto another, relative paths are
relative to the *first* file's directory, never to the file you are editing. Keep the
repository-root compose file first in the list, write overrides as if they sat beside
it, and confirm with `docker compose -f … -f … config` — read the resolved `source:`
of each bind rather than trusting the spelling.

**Applies to**: `.devcontainer/docker-compose.devcontainer.yml` and anything else
layered on `docker-compose.yml` (`docker-compose.app.yml`,
`docker-compose.fullapp.yml`), plus the `dockerComposeFile` array in
`.devcontainer/devcontainer.json`, whose order encodes this rule.

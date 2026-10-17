---
title: "A repository-root marker that is only a filename gets re-created one directory down"
modules: ['api']
areas: ['architecture']
topics: ['env-vars', 'monorepo', 'turborepo', 'local-development', 'false-red']
---

# A repository-root marker that is only a filename gets re-created one directory down

**In short**: `apps/api` found the root `.env.local` by walking up to the first `turbo.json`. #1574 gave every app a package-level `turbo.json`, so the walk stopped at `apps/api` and `npm run api:dev` failed on `TARGET_ENV: Invalid option` while the root file set it. This was the marker's second failure, after a stale lockfile. Check what the file says, not that it exists: the root is now the `package.json` that declares `workspaces`, and an architecture test keeps that declaration unique.

**Context**: `apps/api` loads the root `.env.local` by walking up from its
cwd to the repository root (`apps/api/src/config/load-local-env.ts`). It
first used a lockfile as the marker, which failed because `apps/api` still
had a stale one. It switched to `turbo.json`, and its doc comment said that
file could not be re-created by an `npm install` in the wrong directory.

**Problem**: it was re-created anyway, on purpose, by a fix for another
problem. #1574 added a package-level `turbo.json` (`"extends": ["//"]`) to
every app, so turbo would hash `prisma/schema.prisma`
([lesson](a-cached-typecheck-hides-a-schema-change.md)). `nest start` runs
from `apps/api`, so the walk stopped there, and the root `.env.local` went
unread. `npm run api:dev` on a checkout without `apps/api/.env.local` then
failed with `TARGET_ENV: Invalid option`, while the root file had
`TARGET_ENV=local`. CI and deployments pass their variables directly and
carry no `.env` files, so only a developer's machine could see it. And the
error named a variable, not the file lookup, so it looked like a config
mistake.

**Rule**: a root marker that is just a filename stays correct only until a
tool adds a file with that name one level down. Check what the file says,
not only that it exists. The marker is now a `package.json` that declares
`workspaces`. That is npm's own definition of the root, and nested
workspaces break `npm install`. An architecture test also fails if any
workspace manifest declares them. If you add a per-package config file
whose name a walk-up already looks for, grep for that walk first.

**Applies to**: `apps/api/src/config/load-local-env.ts`, guarded by
`tests/architecture/only-the-repository-root-declares-workspaces.test.ts`.
`scripts/load-root-env.mjs` (web, admin) resolves the root from its own
location instead of walking up, so it was not affected.

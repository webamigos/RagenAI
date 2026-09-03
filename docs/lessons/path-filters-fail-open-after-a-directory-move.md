---
title: 'A path glob in CI config that matches nothing does not fail — it silently stops working'
modules: ['ci']
areas: ['ci']
topics: ['github-actions', 'path-filters', 'codeowners', 'mutation-testing', 'monorepo']
---

# A path glob in CI config that matches nothing does not fail — it silently stops working

**Context**: ADR-29 moved the Next.js app from the repository root into `apps/web/`. The move updated imports, tsconfigs, Prisma generator outputs and the turbo graph, and CI stayed green throughout. Four config files kept root-relative paths anyway, and nothing anywhere reported it.

**Problem**: every construct that takes a path glob in this repository's CI config fails *open* — a pattern that matches nothing is indistinguishable from a pattern that was never there.

- `.github/workflows/evals.yml` — `on.pull_request.paths` listed `src/libs/chains/**` and `evals/**`. Neither existed any more, so GitHub stopped creating the job entirely. Not a failure, not a skip: the "Run CI Eval Gate" check simply vanished from every PR. Nothing shows an absent job. (It was doubly dead: once the filter was fixed, the job's `npm run eval:ci` turned out to need `--workspace=@webamigos/ragen-web`, because the script had moved into the web workspace too.)
- `.github/workflows/e2e.yml` — `hashFiles('src/**/*.ts', …)` returns an **empty string** when it matches nothing, rather than erroring. That collapsed the Next.js cache key to a constant, so every run restored the same stale entry, while `path: ${{ github.workspace }}/.next/cache` pointed at a directory that no longer exists, so each save wrote nothing. The step reported success both ways. The same glob list also asked for `src/**/*.js` and `src/**/*.jsx`; `apps/web/src` holds 777 `.ts` and 613 `.tsx` files and not one of either, so that half had been dead since long before the move — copied out of the Next.js caching docs.
- `stryker.config.mjs` — a `mutate` entry matched nothing, so that file left the nightly mutation scope. Stryker does not warn about an entry that selects zero files, and the recorded 68.33% baseline had quietly been measured without it.
- `.github/CODEOWNERS` — nine rules pointed at paths that no longer match, six of them the auth, tenant-isolation and crypto files this project cares most about (ADR-23). A CODEOWNERS rule matching nothing does not require a reviewer. GitHub renders no warning; the PR just stops asking.

**Rule**: treat "this glob matches at least one real path" as something to assert, not to assume, and assert it against **git-tracked paths** rather than the working tree — the working tree also holds build output and generated files, so a glob kept alive by a local `dist/` or a generated client passes for you and matches nothing on a fresh checkout. `npm run check:config-paths` (`scripts/ci/check-config-path-globs.mjs`) does this for workflow `paths`/`paths-ignore`, `hashFiles()` arguments, `actions/cache` and `actions/upload-artifact` `path:` values, the CTRF reporter's `report-path:`, CODEOWNERS rules and Stryker's `mutate` array. Three things make it work rather than merely exist:

1. **It is asserted from `tests/architecture/`, which `ci.yml`'s `Test` job runs on every PR** with no `paths:` filter of its own. Scoping it to `.github/**` — the obvious instinct — would give it exactly the fail-open behaviour it exists to catch: the commit that breaks a path filter is a directory move, which by definition does not touch the workflow file. A dedicated job would read more clearly in the checks list, but `ci.yml` was deliberately consolidated to four jobs to claw back about an hour of runner time per push, and a fifth job restoring a 2GB dependency tree to run a two-second check is not worth reversing that for.
2. **The allowlist for legitimately-absent build output is exact-match, and each entry names the committed prefix that must still exist.** `apps/web/.next/cache` cannot be verified by existence, but `apps/web` can, and that is the half a directory move changes. A prefix rule or a wildcard here would exempt the bug along with the build output.
3. **A stale allowlist entry fails the build too.** An exemption nothing references any more is the same fail-open bug one level up.

**Corollary, learned the hard way**: the guard cannot see through *committed* generated output. While a stale pre-ADR-29 Prisma client sat tracked at the repo root, `hashFiles('src/**/*.ts')` resolved against those 46 files and passed — the guard could not catch the very construct above. Dropping that committed build output is what closed it, and no amount of special-casing inside the guard would have. Committed build output does not just add noise; it makes every glob that touches it unfalsifiable.

**Applies to**: any directory move in this monorepo, and specifically the remaining ADR-32 absorptions (`ragen-token-vault`, `ragen-mcp`), which will move directories again. Also to adding a new workflow, CODEOWNERS rule or Stryker target: run `npm run check:config-paths` rather than trusting a green CI run to mean the new pattern matched anything.

---
title: "A cached typecheck hides a Prisma schema change, because the schema is outside every workspace"
modules: ['web', 'admin', 'api', 'worker', 'ci']
areas: ['ci', 'testing']
topics: ['turborepo', 'caching', 'prisma', 'false-green', 'monorepo']
---

# A cached typecheck hides a Prisma schema change, because the schema is outside every workspace

**Context**: #1572 added five columns to `Subscription`. A test fixture in
apps/web is typed as `SubscriptionDetails`, so it stopped compiling.

**Problem**: local `npm run verify` reported 70/70 green, replaying typecheck
from turbo's cache. CI has no remote cache, so its Typecheck, Build and
test-e2e (which builds first) all failed on TS2322. The root `turbo.json`
declares no `inputs`, so each task hashes its own workspace's tracked files.
`prisma/schema.prisma` is at the repository root, and the generated clients
are gitignored, so neither reached any app's hash. Measured with
`turbo run … --dry=json`: a schema edit changed 1 of 89 task hashes.

**Rule**: a file that several workspaces compile against, and that lives
outside them, is invisible to turbo's default inputs. Name it in `inputs`,
next to `$TURBO_DEFAULT$`, in each consumer's package `turbo.json`. After a
schema change, a green local `verify` proves nothing until
`turbo run typecheck --force` agrees. The same applies to any root-level file
an app reads at build time.

**Applies to**: `prisma/schema.prisma`, guarded by
`tests/architecture/a-schema-change-invalidates-the-turbo-cache.test.ts`;
`docs/monorepo-tasks.md` has the configuration.

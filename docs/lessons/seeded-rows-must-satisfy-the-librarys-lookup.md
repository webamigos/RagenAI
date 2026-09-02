---
title: "A seed that writes a library-owned table with Prisma has to satisfy that library's lookup, not just its schema"
modules: ['web']
areas: ['dependencies', 'testing']
topics: ['better-auth', 'upgrades', 'e2e', 'seeding', 'migrations']
---

# A seed that writes a library-owned table with Prisma has to satisfy that library's lookup, not just its schema

**Context**: upgrading Better Auth 1.4.18 → 1.7.2 (#841). The upgrade was checked against unit tests, both app builds and a manual read of the changelog. `test-e2e` failed on the PR; the PR merged anyway, and `main` went red — every E2E run before it had been green.

**Problem**: the `setup` project plus `smoke-05` and `smoke-06` timed out waiting for the post-login redirect, with `WARN [Better Auth]: User not found` on the server. 1.7 matches a local credential account on three fields at once:

```js
account.providerId === 'credential' &&
  account.issuer === createLocalAccountIssuer('credential') && // 'local:credential'
  account.accountId === userRecord.user.id;
```

1.4 matched on `providerId` alone. `e2e/seed/e2e-seed.ts` creates that row directly with `prisma.account.create` rather than through the library, and satisfied only the first condition: no `issuer` at all, and the **email** in `accountId`. Both were valid per the Prisma schema — `issuer` was newly nullable, `accountId` is a free-text `String` — so nothing in typecheck, lint or migration could catch it. The fields simply had no reader until 1.7 grew one.

The same three fields are what `internalAdapter.updatePassword` filters on, so a row that disagrees cannot change its password either: it matches nothing, updates zero rows, and reports success.

Two further traps around it:

- The upgrade's migration backfilled `issuer` for existing rows but not `accountId`, because the release notes describe `issuer` as the new column and say nothing about the match widening to `accountId`. The backfill looked complete and was not.
- Locally the same three specs failed **before** the upgrade too, which read as "my environment is broken, not a regression". They failed for an unrelated reason — `npm run build` had not been run, which `AGENTS.md` requires before `test:e2e`. A baseline is only evidence when the baseline itself is set up correctly.

**Rule**: when a library owns a table, code that writes that table outside the library is coupled to the library's _queries_, not just its schema — and an upgrade can add a predicate on a column that was previously write-only. Before upgrading, grep the repo for direct writes to library-owned tables (`prisma.account.*`, `prisma.session.*`, `prisma.member.*`) and check each against how the new version reads them; read the lookup in `node_modules/<pkg>/dist` rather than trusting the release notes to enumerate every field it now compares. When a data-shape assumption turns out to be wrong in a seed, check whether real rows share it — a seed bug and a missing migration usually have the same root cause.

Corollaries: a red required check is red for a reason, and merging past it puts the breakage on `main` where it costs more to find. And when a local baseline disagrees with CI, suspect the local setup before concluding there is no regression.

**Applies to**: `apps/web/e2e/seed/e2e-seed.ts` and any future direct write to a Better Auth table; the general rule applies to every library that owns its own tables.

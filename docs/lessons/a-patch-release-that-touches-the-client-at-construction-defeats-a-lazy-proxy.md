---
title: "A patch release that reads the database client at construction time defeats a lazy client proxy"
modules: ['admin']
areas: ['dependencies', 'testing']
topics: ['better-auth', 'prisma', 'upgrades', 'lazy-initialization', 'proxy', 'env-vars']
---

# A patch release that reads the database client at construction time defeats a lazy client proxy

**Context**: Better Auth 1.7.2 → 1.7.7, a patch-range bump. `apps/admin`
exports its Prisma client as a `Proxy` that builds the real client on first
property access. That way `next build`, which executes route modules, never
needs `DATABASE_URL`.

**Problem**: `@better-auth/prisma-adapter` 1.7.3+ added a schema check. It
reads `client._runtimeDataModel` inside `betterAuth()`, so at import time of
`auth.ts`. Through the proxy that access built the client, and the client
threw `Missing DATABASE_URL environment variable`. Three admin test files
failed with unhandled rejections, and the admin build would have failed the
same way. No changelog line mentions it, because from the library's side
nothing changed in the API. A worktree with no `.env.local` showed it first.
Setting `DATABASE_URL` in the shell did not help, because turbo does not pass
it through to tasks.

The same check had a second effect that only `test-e2e` saw. In apps/web,
whose client is eager, it ran and found five columns
`@better-auth/stripe` has declared since at least 1.7.2 but `subscriptions`
never had (`cancel_at`, `canceled_at`, `ended_at`, `billing_interval`,
`stripe_schedule_id`). It then refused **every** auth request with
`BetterAuthError: Prisma schema mismatch`. Sign-in, sign-out and even the
unauthenticated redirect all failed. `npm run verify` was 70/70 green,
because the check runs only when a request reaches Better Auth.

**Rule**: a lazy proxy is only lazy for properties nobody touches early. When
a dependency bump turns "construct on first query" into "construct on
import", look for a library that started reading a private field of the
object you handed it. The fix is to answer that one property without building
the client (`undefined` is the adapter's documented "stand-in" value), not to
add `DATABASE_URL` to the build. Test it with the variable unset, and check
that the test fails without the fix: an import that only produces an
unhandled rejection does not fail `await import()`.

A library that starts validating its own tables at runtime turns old, harmless
schema drift into a total outage, and does it on deploy. Before merging such a
bump, read the check's expected schema for every plugin you register, or run
one request through it (`test-e2e` does). Fix the drift with an additive
migration rather than turning the check off.

**Applies to**: `apps/admin/src/lib/db.ts`, and any lazy wrapper handed to a
library adapter (Better Auth, an ORM adapter, an SDK that introspects its
client).

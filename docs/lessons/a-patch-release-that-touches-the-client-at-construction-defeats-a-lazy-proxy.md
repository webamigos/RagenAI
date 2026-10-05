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

**Rule**: a lazy proxy is only lazy for properties nobody touches early. When
a dependency bump turns "construct on first query" into "construct on
import", look for a library that started reading a private field of the
object you handed it. The fix is to answer that one property without building
the client (`undefined` is the adapter's documented "stand-in" value), not to
add `DATABASE_URL` to the build. Test it with the variable unset, and check
that the test fails without the fix: an import that only produces an
unhandled rejection does not fail `await import()`.

**Applies to**: `apps/admin/src/lib/db.ts`, and any lazy wrapper handed to a
library adapter (Better Auth, an ORM adapter, an SDK that introspects its
client).

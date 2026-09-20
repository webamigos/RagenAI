---
title: "An architecture guard that scans one app of two is a guard the second app does not have — and the leak it exists to catch shipped in the second app"
modules: ['admin', 'web']
areas: ['architecture', 'testing']
topics: ['turbopack', 'client-components', 'node-builtins', 'workspace-packages', 'barrel-exports', 'hydration', 'false-green', 'architecture-tests']
---

# An architecture guard that reads one app of two

**Context**: guardrails Phase A shipped `/guardrails` in `apps/admin` — a
platform-rule list, a create/edit form, a per-organization override view. Its
two interactive pieces are `'use client'` components, and both imported the new
workspace package by its barrel:

```ts
import { BUILT_IN_GUARDRAIL_LABELS } from '@ragenai/guardrails';
```

`next build` was green. `apps/admin`'s 525 unit tests were green. The package's
own 106 tests were green. The page did not work.

**Problem**: `packages/guardrails/src/index.ts` re-exports the ReDoS probe, and
that module opens with `import { Worker } from 'node:worker_threads'`. Turbopack
cannot externalise a node builtin into a client chunk, so the page
server-rendered correctly, hydrated, threw, and replaced itself with the error
boundary:

```
Cannot find module 'node:worker_threads': Unsupported external type Url for commonjs reference
```

Three things made it survive every check:

- **The server render succeeds.** `curl` with a session cookie returns 200 and
  HTML containing the heading. Only a browser that runs the client chunk sees
  the failure, and the response status stays below 400 the whole time — so even
  a smoke test that asserts on status passes.
- **The unit tests call Server Actions as functions.** They mock Prisma and
  assert the `where` clause. None of them loads the page, so none of them
  bundles a client component.
- **`client-bundles-stay-browser-safe.test.ts` existed for exactly this**, and
  scanned `apps/web/src` only. It was written when apps/web was the one Next
  app that mattered; `apps/admin` grew into a second one without the guard
  following. Its "did I find anything" assertion — `clientEntryPoints.length >
  100` — was satisfied by apps/web alone, so a scan root contributing zero
  files was indistinguishable from a healthy run.

Dev mode was not a safety net: reverting the import with the dev server running
reproduced the identical error through HMR. The page had never worked, in any
mode, on any machine.

What found it was adding `/guardrails` to `smoke-03-every-page-renders`, the
admin e2e spec whose entire purpose is catching a `force-dynamic` page that
fails at runtime. The route had been added to the sidebar and not to that
spec's table, whose comment says it covers "every page the sidebar links to".

**Rule**: three of them, in the order they would have caught this.

1. **A guard that enumerates a scan root must assert per root.** A global
   minimum count hides a root that resolves to nothing. Assert that *each* root
   contributed what you expect, and name the root in the failure message.
2. **When a repo grows a second app of the same kind, walk the guards.** They
   were written against one; none of them fails when a second appears. Grep
   `tests/architecture/` for the old app's path literal.
3. **A workspace package with any Node-only module needs a browser-safe entry
   point, declared in `exports`.** The barrel is what a client component reaches
   for by habit. `@ragenai/guardrails/contracts` carries the vocabulary and no
   imports at all; the barrel keeps the evaluator. Same shape as Prisma's
   `client` versus `browser` entries, and for the same reason.

**Applies to**: any `'use client'` file in `apps/web` or `apps/admin`; any
workspace package under `packages/` that mixes pure contracts with code that
touches `node:*`; every guard in `tests/architecture/` that names a single app.

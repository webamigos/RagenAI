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

---

## It happened again, four days later, in the app the guard had just been taught to read

**Context**: the 2026-09-21 regression pass opened `/mcp-catalogue` — the one
screen ADR-52 exists to provide — and got `This page couldn't load`. Same app,
same failure, same week.

**Problem**: `CatalogueEntryForm` is `'use client'` and imported two constants
and a type from `../validation`. That module imports `isBlockedHost` from
`@ragenai/connector-guard`, whose barrel re-exports the guarded fetch and
transport, which open with `import { isIP } from 'node:net'`. Verbatim the
earlier shape, with `node:net` for `node:worker_threads`:

```
Cannot find module 'node:net': Unsupported external type Url for commonjs reference
```

By then the guard *did* scan `apps/admin`, and rule 1 above had been applied.
It still missed this, because `SERVER_ONLY` is a **denylist of specifier
strings** — `@/generated/prisma/client`, `@ragenai/prisma-client`,
`@ragenai/guardrails`, `serverLogger`. Each entry was added by whoever debugged
the leak it names. `@ragenai/connector-guard` is a package created *after* the
previous entry was written, so nothing matched it. A denylist of four names
cannot fail on the fifth.

`resolveSpecifier` compounds it: it returns `null` for any bare specifier, so
the walk never enters `packages/*/src` at all. The denylist is not a shortcut
to the real check — it is the only check there is.

Two things then hid it for a further four days:

- **The previous pass screenshotted the error and filed the page as healthy.**
  Its method was "request every page, assert the status is 200" — and a
  client-side error boundary *is* a 200. `admin-04-mcp-catalogue.png` in
  `docs/screenshots/2026-09-21-guardrails-regression/` is the error screen, in
  a report whose own words are "none showed an error screen". The screenshots
  were taken and never looked at.
- **The page's own suite was green and could not have been otherwise.** It
  tests the Server Actions as functions; nothing in it bundles a client
  component.

**Rule**: two more, and they supersede rather than repeat the three above.

4. **State the rule, not the names that have broken it.** "No `node:` builtin
   is reachable from a `'use client'` file" is the invariant; a list of the
   four packages that have violated it is a changelog. Follow bare
   `@ragenai/*` specifiers into `packages/*/src` and fail on the *builtin*, so
   the next package is covered before it exists. Keep the named entries for
   their messages, which say which safe entry point to use instead.
5. **A page check that reads a status code cannot see a hydration failure.**
   Render the page and look at what is on it — `This page couldn't load` is the
   whole tell, and it costs one `innerText`. A screenshot only helps if
   something asserts on it; 48 PNGs nobody opened is not evidence, and citing
   them as evidence is worse than not taking them.

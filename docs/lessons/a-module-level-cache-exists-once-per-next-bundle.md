---
title: 'A module-level cache in apps/web exists once per Next bundle, so clearing it from a route handler leaves server components on the old value'
modules: ['web']
areas: ['architecture']
topics: ['nextjs', 'cache', 'route-handler', 'server-components', 'branding']
---

# A module-level cache in apps/web exists once per Next bundle, so clearing it from a route handler leaves server components on the old value

**In short**: Instance branding (spec B2) cached its row in a module variable for 60 seconds, and the save cleared it. The save arrives through a route handler; the panel renders as a server component. Next bundles the two separately, so each had its own copy of the module and the save cleared only one. `smoke-22` passed or failed depending on whether an earlier spec had rendered the panel inside the window. Keep a cache that a different entry point must invalidate on `globalThis`, under a `Symbol.for` key.

## Context

`getInstanceBrandingQuery` in
`apps/web/src/features/branding/services/queries/get-instance-branding-query.ts`
reads one row that changes perhaps once, so it keeps the answer in memory
for 60 seconds rather than querying on every panel render.
`updateInstanceBrandingCommand` clears that cache after a save, and the
save is reached through `/api/internal/instance-branding`.

## Problem

The cache was `let entry` at module scope. In `next start`, route handlers
and server components are separate bundles, and a module imported by both
is instantiated once in each. The route handler cleared its copy; the panel
layout kept reading the other, filled by an earlier render with the default
branding, until its window ran out.

The unit tests passed, because they import the module once. The e2e spec
failed only when another spec had rendered a panel page less than 60
seconds before — on one CI run and not on the next.

## Rule

- A module variable in apps/web is per bundle, not per process. If the code
  that changes the value and the code that reads it can sit behind
  different entry points (a route handler and a page, a Server Action and a
  route handler), keep the state on `globalThis` under a
  `Symbol.for('ragen.…')` key.
- Test it as such: `vi.resetModules()`, import the module a second time,
  clear through one copy and read through the other.

## Applies to

Every in-memory cache in apps/web that something other than its own reader
invalidates — the guardrail loader's cache is the next one to check.

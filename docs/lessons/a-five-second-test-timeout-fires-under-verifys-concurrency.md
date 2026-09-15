---
title: "A five-second test timeout is a CPU budget, not a correctness budget — verify's concurrency:4 starves an architecture guard that runs in 264ms alone"
modules: ['ci', 'web']
areas: ['ci', 'testing']
topics: ['turborepo', 'vitest', 'concurrency', 'timeouts', 'flaky-tests', 'false-red', 'architecture-tests']
---

# A five-second test timeout is a CPU budget, not a correctness budget

**Context**: Phase A4 of the worker-runtime spec moved nineteen producer call
sites onto `@ragenai/jobs`. Every suite passed individually — the root project
122/122, apps/web 311, apps/api, the worker, admin. Then `npm run verify`
failed:

```
FAIL tests/architecture/client-bundles-stay-browser-safe.test.ts
  > no client component can reach 'app/lib/utils/logger/serverLogger'
Error: Test timed out in 5000ms.
```

Not an assertion — a timeout. Re-running `npm run verify` produced the
identical failure, on the identical case.

**Problem**: two runs failing the same way reads as a real regression, and
`docs/lessons.md` already warns that it is not necessarily one. The check that
settles it is not repetition, and the change under review made the hypothesis
plausible: that guard walks the import graph from every `'use client'` file,
and A4 added a module to that graph.

Three measurements, in the order that was actually decisive:

1. **The test alone**: 1.6s, and `--reporter=verbose` put the failing case at
   **264ms** — nineteen times under its own budget. So the graph had not grown.
2. **`verify` on a clean `main`** (`git stash push -u`): 56/56 green. That is
   what made it look like the change after all, and it is the misleading one —
   it is a single sample of a race.
3. **The same task graph at `--concurrency=1`**: 56/56 green *with the change*.

`verify` is `turbo run lint typecheck typecheck:config test build
--concurrency=4`, and at that width four Next builds, five typechecks and five
vitest projects contend for the same cores. Vitest's 5s per-test default is
wall-clock: a test that needs 264ms of CPU misses it whenever it is scheduled
badly enough. Nothing about the failure says "starved", because a timeout
reports the budget, never the queue.

**Rule**: a timeout in `verify` is a scheduling result until proven otherwise,
and the proof is not a second `verify` run — the race just re-runs. Time the
case alone (`--reporter=verbose` gives per-case milliseconds); if it is far
inside its budget, re-run the *same task graph* serially
(`npx turbo run lint typecheck typecheck:config test build --concurrency=1`)
rather than comparing against `main`. A one-sample comparison against `main`
answers a different question — whether that run happened to win the race — and
it costs a stash, a full rebuild and the memory that `git stash` does not
revert `node_modules`.

Worth separating from
[`verify-races-web-build-against-web-typecheck.md`](verify-races-web-build-against-web-typecheck.md):
that one is a task-ordering defect that a warm cache hides, and it fails with a
missing module. This one is pure CPU contention against a fixed wall-clock
budget, and it fails with a timeout. Same symptom shape — red gate, green task
in isolation — different cause and different diagnostic.

**Applies to**: any `vitest` case in this repository that does real work under
the default 5s timeout, and to the architecture guards in particular — they
read the whole source tree as text, so they are the CPU-heaviest tests that
look the cheapest.

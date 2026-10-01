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

**Update, 2026-09-29 — the budget moved, and the work shrank.** The diagnosis
above kept being right, and kept costing a re-run: on one day nearly every
`npm run verify` failed once on a guard at 5–7 s
(`guardrails-are-not-recopied`, `provider-fragments-carry-their-rules`,
`schema-enums-are-not-redeclared`, `an-adr-reference-resolves`,
`is-on-premise-has-one-reading`), each well under a second alone. A rule that
says "re-run and prove it was scheduling" is right once and a tax every day
after. Two changes, in `vitest.config.ts` and `tests/architecture/tracked-files.ts`:

- **The architecture guards are their own vitest project, with a 30 s
  timeout.** A guard's timeout exists to catch a hang, not to measure its
  work, and 5 s was a CPU budget four concurrent turbo tasks could not
  honour. Package tests keep the 5 s default.
- **They share a worker, and read each file once.** The project runs with
  `isolate: false`, and `readSource()` caches file text per process, so a
  file scanned by several guards — or by every case of one `it.each` — is
  read once per worker. `guardrails-are-not-recopied` re-read every app
  source for each symbol it bans. The suite went from 6.6 s to about 3 s
  alone, and the summed test time from 27 s to about 14 s.

Sharing a worker is only sound while the guards are pure readers, so that is
now a guard of its own: `architecture-guards-share-a-worker-safely.test.ts`
fails on a `vi.mock`, `vi.stubEnv`, `vi.spyOn`, fake timers or a
`process.env` assignment anywhere in `tests/architecture/`.

**The rule, revised:** a timeout in a *package* test under `verify` is still a
scheduling result until proven otherwise, diagnosed as above. An architecture
guard that exceeds 30 s is not scheduling — it is doing too much, and the fix
is `readSource` and fewer passes over the tree, not a larger number.

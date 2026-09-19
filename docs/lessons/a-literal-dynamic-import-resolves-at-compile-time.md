---
title: 'A guarded `await import()` still resolves at compile time, so extracting a package fails `tsc` in the one app that was written to survive it — and the two apps that were not turn out to be the real problem'
modules: ['worker', 'web', 'api']
areas: ['architecture', 'ci']
topics:
  [
    'worker-runtime',
    'temporal',
    'adr-44',
    'dynamic-import',
    'typescript',
    'module-resolution',
    'nextjs',
    'monorepo',
    'extraction',
  ]
---

# A guarded `await import()` still resolves at compile time, so extracting a package fails `tsc` in the one app that was written to survive it — and the two apps that were not turn out to be the real problem

**Context**: the worker-runtime spec's G3 — moving `@ragenai/jobs-temporal` out of this repository to `webamigos/ragen-enterprise`. The plan was a deletion: drop the workspace, drop it from the guards' allow-lists, done. `apps/worker` had been written for this from the first commit of the seam: it reaches the adapter through `await import('@ragenai/jobs-temporal')`, behind `if (resolveWorkerRuntime() === 'temporal')`, which is what lets its image omit the package.

**Problem**: three things, in increasing order of how much they cost.

- **The guarded dynamic import was not enough.** TypeScript resolves the specifier of `import()` whenever it is written as a *string literal*, whatever the runtime branch does — so with the package gone, `apps/worker` fails `tsc --build` with `TS2307: Cannot find module '@ragenai/jobs-temporal'`. The runtime guard buys nothing at compile time. The spec had said so in §1 (*"the specifier cannot be a literal once the package leaves"*) and the implementation had not done it, because until the extraction nothing could tell the difference.

- **`apps/web` and `apps/api` imported it statically, and nothing had noticed.** §1's design was a dynamic specifier inside `getJobRuntime()`. What shipped was `registerJobRuntime()`, added for a real reason — a Next or Nest build does not trace a computed specifier — with each app registering eagerly at its own entry point. Correct for both, and it quietly made two of the three consumers unable to survive the extraction the seam existed to enable. The architecture guards were all green: they policed `@temporalio/*`, and the adapter is not `@temporalio/*`.

- **So the extraction was not a deletion, it was a decision.** An `apps/web` that cannot import the adapter cannot enqueue on Temporal, and a Next standalone build cannot be layered the way the worker's image can — it traces its imports at build time. What looked like a chore became: who builds `web` and `api` for a Temporal deployment?

**What worked**: the type side lives in the seam, once, and no call site writes a literal. `packages/jobs/src/optional-adapter.ts` exports `TEMPORAL_ADAPTER_PACKAGE` (a constant, so `import(TEMPORAL_ADAPTER_PACKAGE)` is `Promise<any>` rather than a resolved module) and `TemporalAdapterModule<Options>` (the narrowest true statement about a module this repository does not contain — a constructor returning a `JobRuntime`, with the options type supplied by the one caller that has the SDK types). `apps/worker` and the parity harness load through it; `apps/web` and `apps/api` register BullMQ only and say at the call site what a Temporal deployment adds.

**Rule**: **a package that is meant to be absent has to be absent in a way the compiler agrees with, and a runtime guard is not that.** Before planning an extraction, grep for the package's *specifier* rather than for the engine it wraps, and read every consumer: `await import('pkg')` and `import { x } from 'pkg'` fail the same way once `pkg` is gone. The only check that establishes it is a build of a default install with the package uninstalled — `npm run verify` on a tree that does not contain it — which is why the spec asked for exactly that and why running it is what found all three of these.

**Rule for a seam with more than one consumer**: the consumers are not interchangeable, and which mechanism each can use is a property of its *build*, not of its code. Plain Node can load a package dynamically; a bundler that traces imports at build time cannot load one that is not in the tree. An extraction plan that says "the adapter is behind the seam" has not established anything until each consumer has been checked against its own build. Supporting some consumers and not others is worse than supporting none: producers split across two engines look exactly like a worker that is merely slow.

**Applies to**: `packages/jobs` and any future optional runtime; `apps/web`'s `libs/jobs`, `apps/api`'s `jobs.service.ts` and `apps/worker`'s `jobs.ts`, which are the three registration points; and to `packages/jobs-bullmq` if the default ever becomes optional too. The same shape is available wherever a package is declared optional but named by a literal — `apps/worker/src/worker.ts`'s `await import('./temporal-runtime.js')` is safe only because that module is local and always present.

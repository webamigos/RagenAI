# ADR-44: BullMQ is the Worker Runtime; Durable Execution is an Enterprise Adapter

**Status:** Accepted. Supersedes [ADR-07](07-temporal-document-processing.md).
Implemented through
[the worker-runtime spec](../specs/2026-09-15-bullmq-is-the-worker-runtime.md) —
Phases A–D done, Phase E in progress, Phase G (extracting the adapter) deferred
until a `ragen-worker` image exists.
**Date:** 2026-09-16

## Context

[ADR-07](07-temporal-document-processing.md) chose Temporal in June 2024, and
it considered exactly the alternative being chosen now: *"In-process background
jobs (e.g., Bull/BullMQ with Redis) — simple but couples processing to the web
server process."*

**That sentence was true of the design as it stood in 2024 and is not true of
the design today.** The worker has been a separate service since before the
monorepo absorbed it ([ADR-26](26-absorb-ragen-worker-into-monorepo.md)); it
runs its own process, scales on its own, and nothing about running BullMQ
inside it would put document parsing back in the web server. The 2024 rejection
was aimed at a coupling that no longer exists.

What Temporal costs a self-hosted install, meanwhile, is concrete: two
containers, a gRPC dependency, its own Postgres schema, six `@temporalio/*`
packages that an architecture test has to version-lock together, and a
programming model most TypeScript developers have never used. For software
whose point is running on a customer's own infrastructure, that is the largest
single item in the install.

The four durability arguments ADR-07 made have also aged differently from one
another:

- **Durable execution** is real and is the one thing genuinely lost. See
  *Consequences*.
- **Per-activity retry policies** did not need an engine. They are numbers the
  handlers declare, and `@ragenai/jobs`'s `runStep` enforces the same numbers on
  either runtime.
- **Workflow history as an audit trail** was never read as one. Ragen's audit
  trail is `ParsingStatus`/`EmbeddingStatus` on the row plus OTel spans; the
  workflow history was used for debugging, which bull-board and a failure stack
  also serve.
- **A separate worker service** is orthogonal to the engine, as above.

## Options considered

1. **Keep Temporal.** No work, no risk, and the install stays heavy. It also
   keeps the SDK-version guard and the `workflowsPath` bundler, which are
   maintenance nobody chose.
2. **Keep Temporal but shrink it** — drop the UI, share the Postgres, slim the
   Helm chart. Saves a container and none of the conceptual weight.
3. **Two supported runtimes, equally.** Every worker change reviewed twice,
   forever, and a dual-runtime guard as a permanent tax on a path almost nobody
   runs.
4. **pg-boss or graphile-worker.** Postgres-native, genuinely lighter again —
   but neither is the thing the ecosystem already knows, which is half the
   stated goal.
5. **Inngest, Trigger.dev, Restate.** Managed durable execution. Wrong
   direction for software that runs on the customer's infrastructure.
6. **BullMQ as the runtime, Temporal as an extractable adapter.**

## Decision

**Option 6.** `@ragenai/jobs` is the seam: job names, payloads, `JobContext`,
retry semantics. `@ragenai/jobs-bullmq` and `@ragenai/jobs-temporal` are
adapters behind it, and an application registers the one it ships with.
`WORKER_RUNTIME` selects it, and the default becomes `bullmq`.

The eight pipelines live in `apps/worker/src/handlers/` and import no engine.
Moving them into the package would have forced 69 activity signatures into the
contract; `ctx.steps<A>` is generic, so the package never names an activity.

**Temporal is extracted, not deleted.** Its adapter is the sole holder of
`@temporalio/*` and its destination is
[`webamigos/ragen-enterprise`](https://github.com/webamigos/ragen-enterprise).
An install that needs durable execution adds the package to the worker image
and sets `WORKER_RUNTIME=temporal`.

### Parity was measured, not assumed

The spec made this decision conditional on a measurement, and the measurement
happened before this ADR was written:
[416 ingests on 2026-09-16](../lessons/bullmq-matches-temporal-at-equal-concurrency-2026-09-16.md),
both runtimes, one machine, one afternoon, against real providers, zero
failures. At twenty concurrent documents the median per document was 12.5s on
Temporal and 12.3s on BullMQ — once the concurrency matched.

It did not match at first, and that is the part worth keeping: at the shipped
default of 10 the median was 24.9s, because BullMQ's `concurrency` counts whole
jobs while Temporal's `maxConcurrentActivityTaskExecutions: 50` counted
activities, about twenty per ingest. **The port's one visible regression was a
unit confusion in a default**, not anything about the engines, and the parse and
embed medians were identical throughout. Raising `DEFAULT_CONCURRENCY` to 20 is
part of E2, and the installer writes the variable explicitly besides.

## Consequences

**No replay, and this is the real cost.** A worker crash at step 15 of 20
re-runs the job from step 1. Every activity must be idempotent, and re-running
costs money — the summary and RAG-score calls are re-issued. Two consequences
were load-bearing enough to get their own implementation steps:

- **Ingest deletes the file's existing vectors before writing, on every run.**
  Qdrant point ids are random uuids, so a redelivered job would otherwise *add*
  a second copy of every chunk rather than replacing it. On Temporal this could
  not happen; under at-least-once delivery it can. An integration test proves it
  survives an actual redelivery, not just a re-run.
- **Payloads carry identifiers, not content.** `optimizeDocument` and
  `reindexDocumentVersion` used to carry whole documents, which sat unencrypted
  in the engine's storage and went stale between enqueue and run.

**No workflow history.** bull-board shows job state, payload, attempts and the
failure stack; OTel covers the rest, less well. Nobody was reading the history
as an audit trail, but debugging a failed run is now a different exercise.

**Redis becomes required for the producers too.** The worker already required it
for its settings cache; under BullMQ the web application and API need it as
well, because that is where the queue is. It must not evict — the worker
refuses to start against an evicting instance, because silent job loss is
indistinguishable from work nobody submitted.

**Rollback gets worse in two steps.** Through Phase E, reverting is
`WORKER_RUNTIME=temporal` plus a worker image built with that workspace
installed. After Phase G the adapter is in another repository, so rolling back
means pulling a different image. What rollback never recovers is in-flight jobs
on the abandoned engine; drain before switching.

## What "Temporal is still supported" is promised to mean

A runtime nothing runs is abandoned with a package name, so the promise is
specific. Two of the three are commitments this decision makes rather than
facts it reports, and saying which is which is the point of writing them down:

1. **One package**, and no `@temporalio/*` outside it. **Not true yet.**
   `jobs-seam-is-the-only-runtime-import.test.ts` holds the line for
   `packages/*` today and deliberately exempts `apps/worker`, which still
   imports `@temporalio/worker` to run its own Temporal branch. E5 moves those
   dependencies into the adapter and E6 takes them out of the image; the guard
   tightens to cover the apps when they do.
2. **The contract is an import, not a copy.** True now: `@ragenai/jobs` is a
   workspace dependency, and it becomes a peer dependency resolved from inside
   the image after Phase G.
3. **CI runs the real thing** — planned, not running. The D1 integration suite
   is written runtime-agnostic and its harness has one implementation; asking
   it for Temporal fails loudly rather than falling back, precisely so this
   gap cannot be mistaken for coverage. Writing the Temporal harness and the
   nightly job is part of Phase E, and that job failing is how we would learn
   that a change to `ctx.steps` broke durable retries. **Until it exists, the
   promise in this section is a commitment rather than a mechanism** — which
   is the failure mode the section opens by naming.

### The drift budget

[ADR-32](32-token-vault-and-mcp-stay-separate.md) asks that a sibling
repository be justified by measured drift rather than by preference, so this
change spends that budget deliberately:

- **While the adapter is here, drift is zero** — it is a workspace in this
  monorepo, carried by the same pull requests.
- **After Phase G it is bounded by shape**: `ragen-enterprise` ships the adapter
  and a Dockerfile that is `FROM` the OSS worker image. It contains no handler,
  no activity and no pipeline — those come from the image. An enterprise worker
  application with its own copy of the activities would be `apps/worker-lite`
  again with a licence attached, and is rejected.
- **Revisit when** a `JobContext` change becomes a breaking change for the
  out-of-repository consumer often enough to be felt. The nightly parity job is
  the detector, and it moves with the package.

## Conventions

- A pipeline takes `(payload, ctx)` and imports no engine. Anything reaching for
  `@temporalio/*` or `bullmq` from `apps/worker/src/handlers/` has undone the
  seam.
- Job names are strings in `@ragenai/jobs`'s `JOB_NAMES`, unchanged from the
  Temporal era: they are what a producer wrote into `UserFile.workflowId` and
  what an in-flight run is keyed by. Renaming one is a migration.
- Cancellation is a database fact, not an engine signal — the command writes
  CANCELLED and the handler reads it at its own checkpoints, so both runtimes
  stop at the same points. `requestCancel` covers only what the engine owns: a
  job that has not started.
- `WORKER_CONCURRENCY` counts whole jobs. It is not comparable to Temporal's
  activity count, and the difference is measured rather than argued.

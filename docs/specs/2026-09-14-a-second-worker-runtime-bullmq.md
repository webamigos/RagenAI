---
title: A second worker runtime — BullMQ behind a job-runtime seam
status: draft
areas: [worker, api, web, admin, infra]
adrs: [07, 21, 26, 33, 35, 37, 40]
---

# A second worker runtime — BullMQ behind a job-runtime seam

## TLDR

Ragen's eight background jobs run on Temporal, which costs a self-hosted
install two containers, a gRPC dependency, a ten-package SDK family that has
to be version-locked by an architecture test, and a programming model most
TypeScript developers have never used. This spec puts a runtime seam
(`@ragenai/jobs`) between the pipeline code and the engine, adds a BullMQ
implementation behind it, and — once parity is proven — makes BullMQ the
default while Temporal stays a supported opt-in. The non-obvious part is that
BullMQ guarantees the *message* and Temporal guarantees the *program*: nothing
here replays, so a crash mid-ingest re-runs the whole job, which is what makes
activity idempotency a load-bearing requirement rather than a nicety.

## Problem

A fresh Ragen install cannot run without Temporal, and Temporal is the single
heaviest thing in the stack relative to what this application asks of it.

**What it costs today.** `temporalio/auto-setup:1.26.2` plus
`temporalio/ui:2.36.0` in [`docker-compose.yml`](../../docker-compose.yml), its
own schema inside the shared Postgres, a dedicated Deployment and ConfigMap in
[`deploy/helm/ragen/templates/temporal.yaml`](../../deploy/helm/ragen/templates/temporal.yaml),
a Terraform variable set, `TEMPORAL_*` in four `.env.example` files, and ten
`@temporalio/*` packages that must move as one — a rule real enough that it has
its own guard,
[`tests/architecture/the-temporal-family-moves-together.test.ts`](../../tests/architecture/the-temporal-family-moves-together.test.ts),
written after #942 installed two copies of the SDK and broke typecheck with an
error naming two identical-looking types.

**What we actually use it for.** All eight workflows in
[`apps/worker/src/workflows/`](../../apps/worker/src/workflows) are linear
chains of activities. There is no `continueAsNew`, no child workflow, no timer,
no `sleep`, no saga compensation, no workflow that outlives a single request's
worth of work; the longest `startToCloseTimeout` in the tree is 15 minutes
(`optimizeDocument`). The durable-execution features genuinely in use are:
per-activity retry policies, one cooperative cancel signal, one state query,
two cron schedules, and `handle.result()` on a single route. That is the
profile the ecosystem describes as *"you don't need durable execution, you need
a durable queue"* — and [ADR-07](../adrs/07-temporal-document-processing.md)
itself lists "Bull/BullMQ with Redis" as the option it rejected in 2024, on a
reason that no longer holds: it assumed in-process jobs inside the web server,
and we now have a separate worker process either way.

**What it costs in people.** Determinism constraints, workflow bundling for
production, "rename an activity and Temporal Cloud still references the old
name", "only one worker instance per build" — each is a real rule in
[`apps/worker/AGENTS.md`](../../apps/worker/AGENTS.md), and each is knowledge
that transfers nowhere else. BullMQ is the default answer in the TypeScript
ecosystem, and this team already runs the exact pattern in another project
(`justnails-app`: a `packages/queue` workspace, a queue-name→processor
registry, BullMQ job schedulers, bull-board behind Basic Auth).

The goal is a Ragen that a small self-hosted deployment can run without
Temporal at all, without the codebase forking into two pipelines.

## Out of scope

- **Deleting Temporal.** It stays a supported runtime, selected by
  `WORKER_RUNTIME=temporal`. Removing it is a separate decision with its own
  ADR, taken after the BullMQ path has run in production.
- **Changing any activity.** The 40-odd functions under
  `apps/worker/src/activities/` keep their signatures and behaviour. This spec
  moves the orchestration around them, and nothing else.
- **Changing retrieval.** No chunking, embedding, reranking or prompt change —
  [ADR-20](../adrs/20-pause-and-measure-rag-quality.md) applies, and this
  change must be measurably neutral on ingest output, not "probably fine".
- **The BullMQ PostgreSQL backend.** Real, shipped in BullMQ 6.0.0, and the
  reason the seam has a second level (see *Phase F*) — but not in the first
  release.
- **Removing Redis from `apps/web`.** It stays genuinely optional there.
- **Replacing the event bus** ([`docs/event-bus.md`](../event-bus.md)) or
  Pusher notifications. Different mechanism, different problem.
- **Workflow-history parity.** Temporal's per-activity event history is not
  reproduced. bull-board plus OTel spans is the replacement, and it is less.

## Relationship to the other 2026-09-14 specs

Four specs written on 2026-09-14 share one shape: **a seam, and a second
implementation behind it.** Three of them make a concern selectable and change
no default — the job runtime, the vector store, the document parser. The fourth
replaces the LiteLLM proxy outright, and is the only one of the four that
retires anything.

The install-size argument is what motivates them, but **none of the three
deletes the incumbent.** Temporal stays a supported runtime, Qdrant stays
`DEFAULT_VECTOR_STORE`, Docling stays the default parser — each of those is
written in the relevant spec's own _Out of scope_.

| Spec                                                                           | Makes selectable                             | The incumbent, afterwards                            | What choosing the alternative costs                          |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| [A second worker runtime](2026-09-14-a-second-worker-runtime-bullmq.md)        | the job runtime (`WORKER_RUNTIME`)           | Temporal stays supported; **Phase E flips the default** | no replay — a crash re-runs the job from the top; Redis becomes required |
| [pgvector](2026-09-14-pgvector-as-a-second-vector-store.md)                    | the vector store (`Organization.vectorStore`) | Qdrant stays the default, and the recommendation      | a shared failure domain with Postgres, and different retrieval numbers |
| [Mistral Document AI](2026-09-14-mistral-document-ai-as-a-second-parser.md)    | the document parser (`DOCUMENT_PARSER`)      | Docling stays the default                            | documents leave the deployment                                |
| [LiteLLM retirement](2026-09-14-replace-litellm-with-an-in-process-gateway.md) | — it **replaces** rather than adds           | the proxy is retired in Phase B                      | provider keys move into the application processes             |

The container count is a **consequence available to an operator who selects
every alternative**, not the goal and not something the default install does. A
profile that opts into all of them runs without `temporal`, `temporal-ui`,
`qdrant`, `docling`, `litellm` and `litellm-postgres` — ten services down to
four, and to one once the BullMQ spec's Phase F puts queues on Postgres and
Presidio stays optional. That profile is additional. **No spec here subtracts a
capability; each adds a choice**, and the elasticity is the deliverable.

That is worth stating in each spec because the reviewer of any one of them is
looking at a quarter of a programme, and the reason to accept a trade-off in one
is usually written in another.

Three ADR numbers are reserved so the phases do not collide, since two of these
specs originally both claimed ADR-44: **44** the job runtime, **45** the vector
store, **46** the document parser. They are reserved, not ordered — whichever
lands first writes its own number.

Three couplings are specific enough to act on here:

1. **`addDocumentsToVectorStore` is claimed by two specs.** C3 below makes
   ingest delete this file's vectors before writing; pgvector's B1 makes the
   same function dispatch on the organization's backend, and its B2 renames the
   directory it lives in. Whichever lands second rebases onto the other. The
   cheapest order is Phases A and B here (pure seam, no behaviour change) →
   pgvector's A and B → C3, which by then has to be correct for two backends.
   C3's premise — Qdrant point ids are random uuids, so a redelivered job adds a
   second copy of every chunk — has a cheaper answer on pgvector, where a
   delete and an insert in one transaction are idempotent by construction. The
   requirement is shared; the implementation is per backend.

2. **No replay makes a hosted parser re-billable.** _What we lose_ #1 says a
   crash re-runs the job from the top and re-issues the summary and RAG-score
   LLM calls. Under `DOCUMENT_PARSER=mistral` it also re-issues the OCR call, at
   $4 per 1000 pages — a 1000-page document costs $4 every time a worker dies
   mid-ingest, and the parser spec's pre-flight size guard does not help,
   because the request was already made. That is an argument for C4
   (identifiers, not payloads) and for the stalled-job settings rather than
   against either spec, but neither spec can see it from inside itself.

3. **This is the one alternative that adds a hard dependency.** Selecting
   pgvector or the Mistral parser needs nothing new — one reuses the database
   already there, the other reuses an HTTP call. Selecting BullMQ promotes
   Redis from optional to required, so the elasticity here is not free the way
   the other two are, and Phase E makes that the default path rather than an
   opt-in one. Phase F is what closes the gap, and it stops being "later, not
   now" the moment a light profile is something we ship — a profile assembled
   from every alternative but still needing Redis is most of the way to not
   being light.

## Proposed solution

### 1. `packages/jobs` — the seam

A new workspace package, consumed by `apps/web`, `apps/api` and `apps/worker`,
holding four things:

```
packages/jobs/src/
  contract.ts      JOB names, payload types, JobRuntime interface
  runtime.ts       getJobRuntime() — reads WORKER_RUNTIME, returns one impl
  temporal/        adapter over @temporalio/client + @temporalio/worker
  bullmq/          adapter over bullmq
  retry.ts         the shared retry/timeout semantics (see §3)
```

The producer-side interface is everything the ~12 call sites in `apps/web` and
`apps/api` do today:

```ts
export interface JobRuntime {
  start<N extends JobName>(job: N, runId: string, payload: JobPayloads[N]): Promise<void>;
  getRun(runId: string): Promise<JobRun>;          // status + result, for the docgen route
  requestCancel(runId: string): Promise<void>;     // see §4
  upsertSchedule(schedule: JobSchedule): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
}
```

Job names stay the strings they are today (`runFileEmbeddings`, `scrapeWebsite`,
…) so nothing in flight breaks and the existing "reference by string name"
convention survives. They move *into this package* from the two places that
declare them now —
[`apps/web/src/features/documents/contracts/document.types.ts`](../../apps/web/src/features/documents/contracts/document.types.ts)
(`Workflow` enum) and
[`apps/api/src/temporal/temporal.consts.ts`](../../apps/api/src/temporal/temporal.consts.ts),
which today carries a hand-maintained copy with a comment saying "keep in sync
by hand". That copy is exactly what
[ADR-33](../adrs/33-shared-platform-contracts-package.md) and
`tests/architecture/shared-contracts-are-not-recopied.test.ts` exist to stop;
it lands in `@ragenai/jobs` rather than `platform-contracts` because it is
runtime plumbing, not a per-organization capability.

### 2. The workflow bodies become runtime-neutral handlers

Today each workflow opens with `proxyActivities<typeof activities>({retry,
startToCloseTimeout})` and destructures the activities it needs. The seam keeps
that shape:

```ts
export async function runFileEmbeddings(payload: RunFileEmbeddingsPayload, ctx: JobContext) {
  const { splitText, prepareMetadata, /* … */ } = ctx.steps<typeof activities>({
    retry: { initialInterval: '1 second', maximumInterval: '1 minute',
             backoffCoefficient: 2, maximumAttempts: 5 },
    startToCloseTimeout: '1 minute',
  });
```

- On Temporal, `ctx.steps` **is** `proxyActivities` — same durable retries,
  same timeouts, byte-for-byte the same behaviour.
- On BullMQ, `ctx.steps` returns the activity functions wrapped in an
  in-process retry loop with the same backoff maths and an `AbortSignal`-based
  timeout.

`ctx.log` replaces `log` from `@temporalio/workflow` (Pino on BullMQ). A shared
`JobFailure` replaces `ApplicationFailure`; `JobFailure.nonRetryable(…)` maps
to `ApplicationFailure.nonRetryable` on one side and BullMQ's
`UnrecoverableError` on the other. That is the entire coupling surface — four
imports across eight files.

The consequence worth stating plainly: **the retry semantics differ even though
the configuration is identical.** Temporal's activity retry survives a worker
crash; the BullMQ wrapper's does not — a crash mid-backoff loses the retry
state, and BullMQ retries the *whole job* from the top instead. See *What we
lose*.

### 3. Concurrency does not translate one-to-one

`apps/worker/src/worker.ts` sets `maxConcurrentActivityTaskExecutions: 50`.
That is fifty *activities*, and one ingest is roughly twenty sequential
activities — so it never meant fifty concurrent files. BullMQ's `concurrency`
counts whole jobs. Copying the 50 across would raise real concurrency several
fold in one commit.

Default `WORKER_CONCURRENCY=10`, and the only measurement we have —
[the 2026-09-05 load test](../lessons/worker-concurrency-load-test-2026-09-05.md)
— is 20 concurrent ingests, twice, zero failures, p95 between 27s and 49s. That
lesson explicitly refuses to call 20 a safe ceiling, so 10 is the conservative
read of it, not a derived number.

### 4. Cancellation becomes a database fact

Today cancellation is a Temporal signal setting an in-memory `cancelled` flag
that `checkCancelled()` reads at checkpoints
([`apps/worker/src/workflows/signals.ts`](../../apps/worker/src/workflows/signals.ts)).
BullMQ has no signals, and inventing a Redis-only equivalent would give the two
runtimes two different cancellation mechanisms.

Instead: **`cancelFileEmbeddingCommand` writes the CANCELLED status itself**,
conditionally —
`updateMany({ where: { id, organizationId, parsingStatus: { notIn: [COMPLETED, FAILED, CANCELLED] } } })`
— and `ctx.checkCancelled()` re-reads the row at the same checkpoints it checks
today. One mechanism, both runtimes, no migration.

Three things get better for free: the UI flips to CANCELLED immediately instead
of at the next checkpoint; cancelling a run whose engine record has aged out no
longer throws `WorkflowNotFoundError`; and the guard against a late activity
overwriting CANCELLED becomes a `where` clause instead of ordering luck. The
cost is one indexed `SELECT` per checkpoint — about five per ingest.

`requestCancel` stays on the `JobRuntime` interface for the runtime-level part
(BullMQ `job.remove()` for a job still waiting in the queue; Temporal
`handle.cancel()`), because a queued-but-not-started job should never start.

### 5. Status and result for the document-generation route

[`apps/web/src/app/api/documents/status/[workflowId]/route.ts`](../../apps/web/src/app/api/documents/status/%5BworkflowId%5D/route.ts)
calls `handle.describe()` and `handle.result()`. On BullMQ that is
`job.getState()` and `job.returnvalue`, which means completed jobs must be
retained: `removeOnComplete: { age: 3600, count: 1000 }` on the docgen queue,
long enough for the polling UI.

The org check is a `docgen-{orgId}-` prefix test on the run id. It keeps
working, because run ids are unchanged and BullMQ takes a caller-supplied
`jobId`. Rejected alternative: persisting the generated document's result in
Postgres and dropping the runtime status call entirely — cleaner, and the right
long-term shape, but it is a schema change and a second capability wearing this
spec's name.

### 6. Schedules

Two Temporal Schedules exist, created by explicit scripts
(`ensure-demo-cleanup-schedule.ts`, `ensure-analytics-retention-schedule.ts`).
The BullMQ equivalent is `queue.upsertJobScheduler(id, { pattern, tz:
'Europe/Warsaw' }, …)` — idempotent, and clock-drift-safe by design since
BullMQ 5.

Both scripts keep their current shape and both keep their `--delete` flag,
because the reason they are scripts is unchanged and stated in their own
headers: *"an environment that merely runs the worker image would acquire a job
that deletes threads"*. Idempotency makes boot-time registration technically
possible; it does not make it correct.

One gap: Temporal's `ScheduleOverlapPolicy.SKIP` has no BullMQ equivalent. The
two nightly jobs go on a dedicated `ragen-maintenance` queue with
`concurrency: 1`, and each scheduled run takes a deterministic
`jobId` (`${scheduleId}:${YYYY-MM-DD}`) so a duplicate enqueue is dropped by
BullMQ's own id uniqueness.

### 7. The queue admin panel

Temporal UI on port 8080 is how anyone currently sees what the worker is doing.
Removing it without a replacement makes the "lighter" install worse to operate,
so bull-board ships in the same phase as the runtime — not later.

`@bull-board/api` + `@bull-board/express`, mounted by the worker process on its
own port (`WORKER_ADMIN_PORT`, default 8090) behind Basic Auth, exactly the
shape already proven in `justnails-app`'s `apps/worker/src/bull-board.ts`:
router built by a function that returns the app rather than binding a port, so
it is unit-testable, with an unauthenticated `/health` beside it. Off unless
`WORKER_ADMIN_USER` / `WORKER_ADMIN_PASSWORD` are both set — a queue dashboard
that appears by default on an unauthenticated port is a finding, not a feature.
bull-board supports BullMQ v6 including Postgres-backed queues, so it survives
Phase F.

`apps/admin` gets a link to it, not an embed.
[ADR-35](../adrs/35-two-admin-surfaces-split-by-scope.md) puts platform-wide
operations in `apps/admin`, and the honest reading is that the board *belongs*
there behind Better Auth and `isAppAdmin()` rather than behind a second
credential. Doing it properly means proxying an Express router through a Next
route handler; that is a follow-up step, named in Phase E, not a reason to
delay the panel.

### What BullMQ 6 actually gives us (research, 2026-09-14)

| | |
|---|---|
| Version / licence | `bullmq@6.3.6`, MIT. v6.0.0 landed 2026-07-30 |
| Backends | Pluggable (`IQueueBackend`): Redis, and PostgreSQL 13+ (14+ recommended) |
| Peer deps | `ioredis`, `pg`, `redis`, `bullmq-otel` all **optional** peers since v6 — install only what the chosen backend needs |
| Scheduling | Job Schedulers (cron + tz), resilient to clock drift and to several producers starting at once. Legacy repeatable jobs were removed in v6 |
| Composition | Flows / `FlowProducer` for parent-child DAGs — not needed here, the pipelines are linear |
| Throughput | Rate limiting, priorities, per-queue concurrency. Postgres backend runs ~1.5–2× fewer jobs/s than Redis |
| Observability | Official `bullmq-otel` add-on emitting OTel spans — plugs into the existing collector ([ADR-22](../adrs/22-observability-opentelemetry.md)) |
| Operational requirements | Redis `maxmemory-policy noeviction` (BullMQ calls it the only setting that guarantees correct queue behaviour) and AOF persistence at ~1s |

### Alternatives considered

- **A second app, `apps/worker-lite`.** Fastest first release, and the pipeline
  forks at the first ingest change. [ADR-26](../adrs/26-absorb-ragen-worker-into-monorepo.md)
  and [ADR-33](../adrs/33-shared-platform-contracts-package.md) are both
  records of this repo paying to *undo* exactly that duplication. Rejected.
- **Seam only inside the worker**, with `apps/web`/`apps/api` still speaking
  Temporal. Smallest diff and it does not solve the problem: you still cannot
  run Ragen without Temporal.
- **pg-boss or graphile-worker.** Postgres-native, no Redis, genuinely lighter
  again — but neither is the thing the ecosystem knows, which is half the
  stated goal, and BullMQ's own Postgres backend now reaches the same place
  without a second library.
- **Inngest / Trigger.dev / Restate.** Managed or semi-managed durable
  execution. Wrong direction for software whose point is running on a
  customer's own infrastructure.
- **BullMQ's Postgres backend immediately.** The lightest possible stack, and
  the newest code path in a library we would be adopting the same week. It
  becomes a second seam level once the Redis path is boring (Phase F).
- **Keep Temporal, shrink it instead** (drop the UI, share the DB, slim the
  Helm chart). Saves a container and none of the conceptual weight, and the
  SDK-version guard stays.

### What we lose, stated plainly

1. **No replay.** A worker crash at activity 15 of 20 re-runs the job from
   activity 1. Every activity must be idempotent, and re-running costs real
   money — the summary and RAG-score LLM calls are re-issued.
2. **`addDocumentsToVectorStore` is append-only.** Qdrant point ids are random
   uuids, so a re-run after a crash *adds* a second copy of every chunk rather
   than replacing it — this is why `reindexDocumentVersion` deletes first and
   says so in its own comment. On Temporal this cannot happen (the workflow
   resumes past the completed step). On BullMQ it can. **Ingest must delete
   this file's existing vectors before writing, on every run.** This is the
   single highest-risk item in the spec and it gets its own step (C3).
3. **No workflow history.** No per-activity event log, no "what did attempt 3
   receive". bull-board shows job state, payload, attempts and the failure
   stack; OTel spans cover the rest, worse.
4. **Retry state is not durable** — see §2.
5. **Job payloads live in Redis.** `optimizeDocument` and
   `reindexDocumentVersion` carry the *entire document text* in the payload
   today. Under Temporal it sits unencrypted in Temporal's Postgres; under
   BullMQ it sits unencrypted in Redis, which in this stack has no eviction
   policy set and no AOF. Not a regression, but it is the moment to fix it:
   pass identifiers, read the text inside the job (step C4).

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `prisma/schema.prisma` | **None.** `UserFile.workflowId` is reused as the run id; only its comment changes | n/a — and that is the cheap case |
| `packages/jobs` (new) | The seam itself | package tests + web/api/worker builds; new `tests/architecture/job-runtimes-stay-in-step.test.ts` |
| `packages/env` | `WORKER_RUNTIME` seam + `WORKER_CONCURRENCY`, `WORKER_ADMIN_*` | `provider-fragments-carry-their-rules.test.ts`, `config-groups`, `ragen-config-is-generated.test.ts`, `config-reference-is-generated.test.ts` |
| `packages/create-ragen-app` | Manifest keys, the compose service list, the outro | `create-ragen-app-manifest-is-current.test.ts` + `installer.yml` |
| `apps/web/src/libs/temporal/` | Replaced by a thin `@ragenai/jobs` re-export; deleted in Phase E | build + the existing command tests |
| `apps/api/src/temporal/` | `TemporalClientService` → `JobsService` over the seam | `apps/api` unit tests |
| auth / tenant scoping | Unchanged. The `docgen-{orgId}-` prefix check and every `organizationId` filter stay as they are | guard tests, `ragen-tenant-scope-audit` |
| `docker-compose*.yml`, Helm, Terraform | Temporal moves behind a profile / `enabled: false`; Redis becomes required for the default path | `docs-name-the-published-service-ports.test.ts`, `helm.yml`, `check:config-paths` |

## Data model

**No migration.** Deliberately:

- `UserFile.workflowId` (`String?`) already holds a caller-supplied id and
  BullMQ accepts a caller-supplied `jobId`. Rows written under Temporal stay
  valid; the column comment stops saying "Temporal".
- Cancellation reuses `parsingStatus` / `embeddingStatus`, which already have
  a `CANCELLED` member.
- Schedules are engine state, not rows.

**Rows written before this change:** unaffected. The one real discontinuity is
operational, not schema: a run *in flight* when `WORKER_RUNTIME` changes is
orphaned — the new runtime has never heard of it, so its file sits in
`PROCESSING` until something re-embeds it. Drain before switching (see
*Rollout*).

## Failure modes

| Situation | Behaviour |
| --- | --- |
| Redis down while a producer enqueues | `jobs.start()` throws; every call site already handles a start failure (`workflow_start_failed` in `uploadFileCommand`, and the same shape in `apps/api`) |
| Redis down while the worker runs | BullMQ reconnects with backoff; `Worker` needs `maxRetriesPerRequest: null` or a blip kills it |
| Redis evicts queue keys | Silent, arbitrary job loss. `maxmemory-policy noeviction` is mandatory, set in compose and Helm, and asserted at worker boot |
| Worker crashes mid-job | Job is redelivered and re-runs from the top. Safe only because of C3/C4 idempotency work |
| Event loop blocked by CPU work (sharp, resvg, pdfium, xlsx) | The job lock is renewed on a timer; a blocked loop lets it expire, BullMQ calls the job stalled and **runs it a second time in parallel**. `lockDuration` raised to 5 min, `maxStalledCount: 1`, and CPU-bound activities are candidates for sandboxed processors |
| A 10-minute Docling parse | Fine while it awaits I/O — the lock renews. Covered by the same `lockDuration` setting |
| Two nightly runs overlap | `concurrency: 1` on `ragen-maintenance` + a per-day deterministic `jobId` |
| Cancel arrives after the job finished | Conditional `updateMany` matches nothing; the command returns "already finished" instead of throwing `WorkflowNotFoundError` |
| Cancel races a status write | The `notIn` guard means a late activity cannot overwrite CANCELLED |
| Docgen result polled after retention expiry | `getRun` returns `unknown`; the route answers 404 exactly as it does today for an aged-out workflow |
| Both runtimes running at once | Producers write to one engine only, so the other's jobs never run. The worker refuses to start if it finds a live queue for the runtime it is *not* configured for |
| Temporal schedule left behind after the switch | Keeps firing against a worker that no longer listens. The `--delete` flag on both scripts is a required rollout step — the same trap already documented in those scripts |

## Phases

Each phase leaves the application working.

### Phase A — the seam, Temporal only

- [ ] **A1.** Create `packages/jobs` with `contract.ts` (job names, payload
      types, `JobRuntime`) and the Temporal adapter. `WORKER_RUNTIME` exists in
      `@ragenai/env` but accepts only `temporal`.
- [ ] **A2.** Move the `Workflow` enum and payload types out of
      `apps/web`'s contracts and delete the hand-synced copy in
      `apps/api/src/temporal/temporal.consts.ts`; both re-export from the
      package. Add `job-runtimes-stay-in-step.test.ts`: every job name has a
      handler, and no `@temporalio/*` import exists outside `packages/jobs` and
      the worker's runtime bootstrap.
- [ ] **A3.** Port the eight workflow bodies to `(payload, ctx)` handlers using
      `ctx.steps` / `ctx.log` / `JobFailure`. Behaviour identical; the Temporal
      adapter still registers them as Temporal workflows.
- [ ] **A4.** Replace the ~12 producer call sites in `apps/web` and `apps/api`
      with `getJobRuntime().start(...)`. `apps/web/src/libs/temporal/` becomes
      a re-export shim.

### Phase B — cancellation and status stop being Temporal-shaped

- [ ] **B1.** `cancelFileEmbeddingCommand` writes CANCELLED conditionally;
      `ctx.checkCancelled()` reads the row. Delete the signal and query
      definitions. Still on Temporal.
- [ ] **B2.** The docgen status route goes through `jobs.getRun(runId)`.

### Phase C — the BullMQ adapter (Redis)

- [ ] **C1.** BullMQ adapter: one queue per job name plus `ragen-maintenance`;
      `concurrency`, `attempts`, backoff and timeouts derived from the same
      options object the Temporal adapter reads; `lockDuration: 300_000`;
      retention policies; SIGTERM/SIGINT graceful `worker.close()`.
- [ ] **C2.** `WORKER_RUNTIME=bullmq` accepted. Worker boot asserts the Redis
      `maxmemory-policy` and refuses to start on an evicting instance.
- [ ] **C3.** **Ingest deletes this file's existing vectors before writing**,
      on every run, on both runtimes. Without this a redelivered job duplicates
      every chunk. Covered by a test that runs `runFileEmbeddings` twice and
      asserts the Qdrant point count does not double.
- [ ] **C4.** Shrink payloads to identifiers: `runFileEmbeddings` takes
      `{ fileId, orgId }` and re-reads the row; `optimizeDocument` and
      `reindexDocumentVersion` stop carrying document text. Fixes staleness and
      keeps document content out of Redis.
- [ ] **C5.** Port both schedule scripts to `upsertJobScheduler`, keeping
      `--delete` and the per-day `jobId`.
- [ ] **C6.** bull-board on `WORKER_ADMIN_PORT` behind Basic Auth, off unless
      credentials are set; `/health` unauthenticated. Wire `bullmq-otel` into
      the existing collector.

### Phase D — prove parity

- [ ] **D1.** Worker integration suite against a real Redis (compose service in
      CI): each of the eight jobs enqueued and completed, retries, cancel,
      schedule fire, stalled-job recovery, and the C3 double-run assertion.
- [ ] **D2.** Run the [2026-09-05 load test](../lessons/worker-concurrency-load-test-2026-09-05.md)
      method on both runtimes, same day, same stack, and record the numbers in
      a lesson. Parity here means "no worse", measured — not assumed.
- [ ] **D3.** Add a `ragen:up:full` variant without Temporal and confirm a
      clean clone ingests a document with `WORKER_RUNTIME=bullmq`.

### Phase E — flip the default

- [ ] **E1.** ADR-44 (reserved — see *Relationship to the other 2026-09-14
      specs*): *BullMQ is the default job runtime; Temporal is a
      supported option*. It supersedes [ADR-07](../adrs/07-temporal-document-processing.md)
      as the default choice and says why the 2024 rejection no longer applies.
- [ ] **E2.** Compose: Temporal and Temporal UI move behind a
      `--profile temporal`. Redis gains `--maxmemory-policy noeviction` and
      AOF. Helm: `temporal.enabled: false`, `redis.enabled: true` (it is
      `false` today, with a comment calling Redis "API rate limiting only" —
      that comment stops being true).
- [ ] **E3.** `create-ragen-app`: default `WORKER_RUNTIME=bullmq`, drop
      Temporal from the "starting backing services" list and the outro, keep
      the port-collision check honest.
- [ ] **E4.** Docs: `docs/companion-services.md`, `docs/architecture.md`,
      `apps/docs/docs/self-hosting.md`, the generated configuration reference,
      `AGENTS.md` (Task Router row, Core Surfaces, Commands) and
      `apps/worker/AGENTS.md` (the Temporal-constraints section becomes
      runtime-specific).
- [ ] **E5.** Link bull-board from `apps/admin`, and open a follow-up for
      proxying it behind Better Auth per ADR-35.

### Phase F — later, not now

- [ ] **F1.** `BULLMQ_BACKEND=redis|postgres` as a second seam level, with
      `runMigrations()` in the deploy path and the `bullmq` schema isolated.
      This is what removes Redis from a minimal install entirely.

## Testing

Per the Testing Requirements in [`AGENTS.md`](../../AGENTS.md):

- **Unit** (`packages/jobs`): the retry/backoff wrapper against the same policy
  objects the Temporal adapter passes through; timeout behaviour; the name
  registry; `JobFailure` → `UnrecoverableError` / `ApplicationFailure` mapping;
  schedule id and cron construction. These are thin binding files, which
  `AGENTS.md` calls out as the ones most often left untested.
- **Architecture**: `job-runtimes-stay-in-step.test.ts` (every name handled by
  both adapters; no `@temporalio/*` import leaks outside the seam), and the
  existing `the-temporal-family-moves-together.test.ts` stays — Temporal is
  still here.
- **Integration** (`apps/worker`, Jest, real Redis): D1's list. This is the
  gate, because the Playwright suite deliberately never starts the worker —
  `.github/workflows/e2e.yml` sets a dummy `TEMPORAL_SERVER_ADDRESS` and
  path-ignores `apps/worker/**`. No `p0` e2e can cover this, and pretending
  otherwise would be the failure mode `AGENTS.md` warns about.
- **Manual**: a new row in [`docs/regression-checklist.md`](../regression-checklist.md)
  — upload, cancel mid-ingest, re-embed a folder, generate a document, roll a
  version back — run once per runtime before Phase E.
- **Measurement**: D2, recorded as a lesson.

## Rollout and rollback

**Per deployment, by env var.** `WORKER_RUNTIME` is read by the worker and by
every producer; they must agree, and the worker logs the resolved value once at
boot next to the concurrency and lock settings.

**Order that matters.** Phases A and B ship with no behaviour change and no
operator action. Phase C is opt-in. Phase E changes defaults, and the flip is:
drain (stop producers, let in-flight runs finish, confirm no `PROCESSING`
files) → delete both Temporal schedules with the `--delete` scripts → switch
`WORKER_RUNTIME` → start the worker → confirm both schedules exist in
bull-board.

**Rollback.** Set `WORKER_RUNTIME=temporal` and restart, after the same drain —
there is no migration to unwind, which is the point of keeping the schema
untouched. What rollback does *not* recover is in-flight BullMQ jobs; they stay
in Redis, unread, and the affected files need a re-embed. Re-create the Temporal
schedules with the same scripts.

**The one-way door.** C3 and C4 change ingest and payload shape for both
runtimes and are not runtime-specific; if BullMQ were abandoned entirely, those
two stay, because they are correct on Temporal too.

## Sources

- [BullMQ changelog](https://docs.bullmq.io/changelog) — v6.0.0 (2026-07-30), pluggable backends, repeatable jobs removed
- [BullMQ — PostgreSQL backend](https://docs.bullmq.io/guide/postgresql) — setup, `runMigrations()`, ~1.5–2× throughput gap
- [BullMQ — Going to production](https://docs.bullmq.io/guide/going-to-production) — `noeviction`, AOF, `maxRetriesPerRequest: null`, graceful shutdown
- [BullMQ telemetry](https://bullmq.io/news/241104/telemetry-support/) and [`bullmq-otel`](https://github.com/taskforcesh/bullmq-otel)
- [bull-board](https://github.com/felixmosh/bull-board) — supports BullMQ ≥ 5.56 and all of v6, including Postgres-backed queues
- [`bullmq@6.3.6` on npm](https://registry.npmjs.org/bullmq/latest) — MIT, optional peers `ioredis` / `pg` / `redis` / `bullmq-otel`
- [Best job queue alternatives (Inngest, 2026)](https://www.inngest.com/blog/best-job-queue-alternatives) — "Celery and BullMQ guarantee the message. Temporal guarantees the program."
- Internal prior art: `justnails-app` — `packages/queue`, `apps/worker/src/registry.ts`, `apps/worker/src/bull-board.ts`

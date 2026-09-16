---
title: BullMQ is the worker runtime; Temporal becomes an extractable adapter
status: draft
areas: [worker, api, web, admin, infra]
adrs: [07, 21, 26, 32, 33, 35, 37, 40]
---

# BullMQ is the worker runtime; Temporal becomes an extractable adapter

## TLDR

Ragen's eight background jobs run on Temporal, which costs a self-hosted
install two containers, a gRPC dependency, six `@temporalio/*` packages that an
architecture test has to version-lock, and a programming model most TypeScript
developers have never used. This spec puts a runtime seam (`@ragenai/jobs`)
between the pipeline code and the engine, ports the pipelines to BullMQ, and
makes BullMQ **the** worker runtime — Temporal survives as an adapter package
that moves to [`webamigos/ragen-enterprise`](https://github.com/webamigos/ragen-enterprise),
not as a second default. The non-obvious part is that BullMQ guarantees the
*message* and Temporal guarantees the *program*: nothing here replays, so a
crash mid-ingest re-runs the whole job, which is what makes activity
idempotency a load-bearing requirement rather than a nicety.

## Answered

- **The worker is BullMQ, not "BullMQ as well".** Confirmed 2026-09-15,
  superseding this spec's original framing of a second selectable runtime.
  `apps/worker` becomes the BullMQ worker and the default install contains no
  Temporal at all. The consequence that shapes every phase below: **there is no
  second runtime in the default install to fall back to**, so parity is proven
  once against the Temporal baseline and then the baseline leaves, rather than
  being re-proven forever by a dual-runtime guard.
- **Temporal is extracted, not deleted.** Confirmed 2026-09-15. Its adapter
  becomes `@ragenai/jobs-temporal`, and its destination is
  `webamigos/ragen-enterprise` (private; scaffolded alongside this spec). An
  install that needs durable execution adds the package to the worker image and
  sets `WORKER_RUNTIME=temporal`. What "supported" means is defined in §8 — a
  runtime nothing runs in CI is not supported, it is abandoned with a package
  name.
- **Nothing is published, and the extraction waits for an image.** Confirmed
  2026-09-15, answering what was Q1. No npm package: not `@ragenai/jobs`, not
  the adapter. The delivery mechanism is a container image, and **publishing
  `ragen-worker` is deliberately future work** — nothing in this repository
  publishes an image today (`ghcr.io` appears only in the Docling and Presidio
  upgrade runbooks).

  So the adapter cannot leave yet, and the phases say so rather than pretending
  otherwise: **Phase E keeps `packages/jobs-temporal` in this repository** as an
  optional workspace that the worker image does not install, and **Phase G
  moves it out** once the image exists. Two things follow that are worth
  knowing before reading Phase E:

  - While the adapter is here, the parity job of §8.3 runs *here*, which is the
    easier half. Phase G moves the job with the package, and that is the point
    at which "supported" starts costing something.
  - A developer's root `npm install` still fetches the `@temporalio/*` family,
    because a workspace's dependencies are installed whether or not the image
    wants them. What Phase E removes is Temporal from the **image**, the
    **compose file**, the **chart** and the **default runtime** — not from a
    contributor's `node_modules`. Claiming otherwise would be the kind of
    almost-true statement this spec is trying to avoid.
- **`apps/worker` is neither renamed nor duplicated.** The other reading of
  "keep the current one" is a second worker application, `apps/worker-temporal`,
  next to a BullMQ one. That is the `apps/worker-lite` alternative this spec
  already rejected, and [ADR-26](../adrs/26-absorb-ragen-worker-into-monorepo.md)
  and [ADR-33](../adrs/33-shared-platform-contracts-package.md) are both records
  of this repository paying to *undo* exactly that duplication. What gets
  extracted is the **adapter** — the runtime bootstrap and the client — not a
  copy of the pipeline. The eight handlers and the 69 activity modules stay in
  one place and both runtimes consume them.

## Problem

A fresh Ragen install cannot run without Temporal, and Temporal is the single
heaviest thing in the stack relative to what this application asks of it.

**What it costs today.** `temporalio/auto-setup:1.26.2` plus
`temporalio/ui:2.36.0` in [`docker-compose.yml`](../../docker-compose.yml) — two
of the nine services left there after [#1194](https://github.com/webamigos/RagenAI/pull/1194)
retired the LiteLLM proxy — its own schema inside the shared Postgres, a
dedicated Deployment and ConfigMap in
[`deploy/helm/ragen/templates/temporal.yaml`](../../deploy/helm/ragen/templates/temporal.yaml),
a Terraform variable set, `TEMPORAL_*` in three `.env.example` files and in four
dummy variables in both CI workflows, and six `@temporalio/*` packages declared
across three manifests that must move as one — a rule real enough that it has
its own guard,
[`tests/architecture/the-temporal-family-moves-together.test.ts`](../../tests/architecture/the-temporal-family-moves-together.test.ts),
written after #942 installed two copies of the SDK and broke typecheck with an
error naming two identical-looking types.

**It is not a memory argument, and this spec does not pretend otherwise.** The
[README's measured table](../../README.md) puts Temporal at 97 MB idle and its
UI at 38 MB — next to Docling's 721 MB, that is noise. The cost is
architectural: a gRPC dependency, a second control plane to operate, an SDK
family under a version lock, and a determinism model that constrains how every
pipeline is written.

**What we actually use it for.** All eight workflows in
[`apps/worker/src/workflows/`](../../apps/worker/src/workflows) are linear
chains of activities. There is no `continueAsNew`, no child workflow, no timer,
no `sleep`, no saga compensation, no workflow that outlives a single request's
worth of work; the longest `startToCloseTimeout` in the tree is 15 minutes
(`optimizeDocument`). The durable-execution features genuinely in use are:
per-activity retry policies, one cooperative cancel signal, one state query,
two cron schedules, and `handle.result()` on a single route. That is the profile
the ecosystem describes as *"you don't need durable execution, you need a
durable queue"* — and [ADR-07](../adrs/07-temporal-document-processing.md)
itself lists "Bull/BullMQ with Redis" as the option it rejected in 2024, on a
reason that no longer holds: it assumed in-process jobs inside the web server,
and we now have a separate worker process either way.

**What it costs in people.** Determinism constraints, workflow bundling for
production, "rename an activity and Temporal Cloud still references the old
name", "only one worker instance per build" — each is a real rule in
[`apps/worker/AGENTS.md`](../../apps/worker/AGENTS.md), and each is knowledge
that transfers nowhere else. BullMQ is the default answer in the TypeScript
ecosystem, and this team already runs the exact pattern in another project
(`justnails-app`: a `packages/queue` workspace, a queue-name→processor registry,
BullMQ job schedulers, bull-board behind Basic Auth).

The goal is a Ragen whose default install has no Temporal in it, without the
codebase forking into two pipelines and without the durable-execution option
becoming unavailable to an install that actually wants it.

## Out of scope

- **Deleting Temporal.** It stops being the default and leaves the image in
  Phase E; it leaves the repository in Phase G, once there is a published image
  to layer an adapter onto. The adapter stays maintained behind the seam either
  way. No ADR here says Temporal was a mistake — only that durable execution is
  not what these eight jobs need.
- **Publishing anything.** No npm package and no container image is published
  by this spec. Publishing `ragen-worker` is Phase G's gate and its own
  change.
- **Changing what an activity does.** The 69 modules under
  `apps/worker/src/activities/` keep their signatures. Two steps (C3, C4) change
  what *ingest* does — delete this file's vectors before writing, pass
  identifiers instead of document text — and both are correct on Temporal too.
- **Changing retrieval.** No chunking, embedding, reranking or prompt change —
  [ADR-20](../adrs/20-pause-and-measure-rag-quality.md) applies, and this change
  must be measurably neutral on ingest output, not "probably fine".
- **The BullMQ PostgreSQL backend.** Real, shipped in BullMQ 6.0.0, and the
  reason the seam has a second level (see *Phase F*) — but not in the first
  release.
- **Removing Redis from `apps/web`.** It stays genuinely optional there. It does
  **not** stay optional for the worker; see *What we lose* #6.
- **Moving activities out of `apps/worker`.** The enterprise image extends the
  OSS one rather than rebuilding the pipeline, precisely so this never has to
  happen (§8).
- **Replacing the event bus** ([`docs/event-bus.md`](../event-bus.md)) or Pusher
  notifications. Different mechanism, different problem.
- **Workflow-history parity.** Temporal's per-activity event history is not
  reproduced. bull-board plus OTel spans is the replacement, and it is less.

## Relationship to the other 2026-09-14 specs

Four specs written on 2026-09-14 share one shape: **a seam, and a second
implementation behind it.** One of the four has since landed — the LiteLLM
proxy was retired on `main` on 2026-09-15 (#1194) — and this spec is now the
second that *retires* rather than adds. The two that remain still only add a
choice and change no default: the vector store and the document parser.

| Spec | Makes selectable | The incumbent, afterwards | What choosing the alternative costs |
| --- | --- | --- | --- |
| [This spec](2026-09-15-bullmq-is-the-worker-runtime.md) | — it **replaces** rather than adds | Temporal leaves the default install in Phase E and the repository in Phase G; the adapter stays supported, and an install running it still replays | **on the default runtime** a crash re-runs the job from the top, so every activity has to be idempotent; **Redis becomes required** |
| [pgvector](2026-09-14-pgvector-as-a-second-vector-store.md) | the vector store (`Organization.vectorStore`) | Qdrant stays the default, and the recommendation | a shared failure domain with Postgres, and different retrieval numbers |
| [Mistral Document AI](2026-09-14-mistral-document-ai-as-a-second-parser.md) | the document parser (`DOCUMENT_PARSER`) | Docling stays the default | documents leave the deployment |
| [LiteLLM retirement](2026-09-14-replace-litellm-with-an-in-process-gateway.md) | — it replaced rather than added | **done**: the proxy is gone from `main` | provider keys live in the application processes |

**The programme's framing has changed, and the other two specs now say so.**
Their shared paragraph — "none of the three deletes the incumbent" — was true
when it was written and is not any more; it, their shared table and the
[README](../../README.md)'s "Nothing is removed: Temporal stays a supported
runtime" line were corrected alongside this rewrite rather than left for Phase
E, because a reader of either of those specs would otherwise be told the
opposite of the decision.

One arithmetic correction worth making before anyone quotes a container count,
because the counts circulating in these specs mixed three different scopes.
`docker compose config --services` is the arbiter, and today it answers:

| Scope | Services | Which |
| --- | --- | --- |
| `docker compose up` (default) | **6** | postgres, redis, qdrant, docling, temporal, temporal-ui |
| `--profile pii` adds | 2 | presidio-analyzer, presidio-anonymizer |
| `--profile observability` adds | 2 | otel-collector, jaeger |

So this spec takes the **default stack from six to four**, and the two profiles
are unaffected — they should not appear in the total at all, which is where
"nine to seven" came from. Redis is one of the four and moves from *present but
optional* to *required*; for a Helm install, which ships `redis.enabled: false`
today, that is **one net Deployment removed**, not two. A profile that also
opts out of Qdrant and Docling reaches two, and one after Phase F. The
install-size case for this spec is the weakest of the four; the architectural
case is the strong one, and Phase F is what makes the size claim honest.

Three ADR numbers were reserved so the phases would not collide: **44** the job
runtime, **45** the vector store, **46** the document parser. They are reserved,
not ordered — whichever lands first writes its own number. ADR-44 now says more
than it was going to: not "BullMQ is the default" but *"BullMQ is the worker
runtime; durable execution is an enterprise adapter"*.

Three couplings are specific enough to act on here:

1. **`addDocumentsToVectorStore` is claimed by two specs.** C3 below makes
   ingest delete this file's vectors before writing; pgvector's B1 makes the
   same function dispatch on the organization's backend, and its B2 renames the
   directory it lives in. Whichever lands second rebases onto the other. The
   cheapest order is Phases A and B here (pure seam, no behaviour change) →
   pgvector's A and B → C3, which by then has to be correct for two backends.
   C3's premise — Qdrant point ids are random uuids, so a redelivered job adds a
   second copy of every chunk — has a cheaper answer on pgvector, where a delete
   and an insert in one transaction are idempotent by construction. The
   requirement is shared; the implementation is per backend.

2. **No replay makes a hosted parser re-billable.** _What we lose_ #1 says a
   crash re-runs the job from the top and re-issues the summary and RAG-score
   LLM calls. Under `DOCUMENT_PARSER=mistral` it also re-issues the OCR call, at
   $4 per 1000 pages — a 1000-page document costs $4 every time a worker dies
   mid-ingest, and the parser spec's pre-flight size guard does not help,
   because the request was already made. Under the original framing an operator
   worried about that could select Temporal; under this one they cannot, unless
   they are an enterprise install. That is an argument for C4 (identifiers, not
   payloads) and for the stalled-job settings, and it is now a sharper one.

3. **Redis stops being elastic.** Selecting pgvector or the Mistral parser needs
   nothing new — one reuses the database already there, the other reuses an HTTP
   call. This spec makes Redis a hard requirement for every install, so the
   light profile assembled from every alternative still needs it. Phase F is
   what closes that gap, and it stops being "later, not now" the moment a light
   profile is something we ship.

## Proposed solution

### 1. `packages/jobs` — the seam, the handlers, and the BullMQ adapter

A new workspace package, consumed by `apps/web`, `apps/api` and `apps/worker`:

```
packages/jobs/src/
  contract.ts      JOB names, payload types, JobRuntime, JobContext
  runtime.ts       getJobRuntime() — reads WORKER_RUNTIME, returns one impl
  bullmq/          adapter over bullmq
  retry.ts         the shared retry/timeout semantics (see §2)
```

The eight pipelines stay in `apps/worker`, beside the activities they call, and
are handed to the runtime at boot — see §2.

The producer-side interface is everything the nineteen call sites in `apps/web`
and `apps/api` do today:

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
`tests/architecture/shared-contracts-are-not-recopied.test.ts` exist to stop; it
lands in `@ragenai/jobs` rather than `platform-contracts` because it is runtime
plumbing, not a per-organization capability.

**The Temporal adapter is a separate package from the first commit.**
`packages/jobs-temporal` is created in Phase A, depends on `@ragenai/jobs`, and
is a dependency of *nothing* in `apps/web` or `apps/api`. `getJobRuntime()`
resolves `WORKER_RUNTIME=temporal` through a dynamic
`import('@ragenai/jobs-temporal')` and fails at boot, naming the package to
install, when it is absent.

**The specifier cannot be a literal once the package leaves.** TypeScript
resolves module specifiers in dynamic imports at compile time, whatever the
runtime branch does — so after Phase G a clean default install would fail
`tsc --build` with a module-resolution error instead of the intended boot-time
message, and an `optionalDependencies` entry does not help. The seam therefore
resolves the adapter through a specifier the compiler does not follow, with an
ambient declaration of the adapter's exports as the type side, and Phase G
adds a build of a default install with no adapter present as the check that
this stays true. A runtime that is meant to be absent has to be absent in a way
the compiler agrees with.

Two things follow from the package split, and both are the point:

- the architecture guard is one line — no `@temporalio/*` import outside
  `packages/jobs-temporal` — and it is what makes Phase E's extraction a
  `git mv` rather than an archaeology exercise;
- `apps/web` and `apps/api` stop containing Temporal code in Phase A, months
  before the engine goes away.

### 2. The workflow bodies become runtime-neutral handlers

Today each workflow opens with `proxyActivities<typeof activities>({retry,
startToCloseTimeout})` and destructures the activities it needs. The seam keeps
that shape:

```ts
export async function runFileEmbeddings(payload: RunFileEmbeddingsPayload, ctx: JobContext) {
  const { splitText, prepareMetadata, /* … */ } = ctx.steps<Activities>({
    retry: { initialInterval: '1 second', maximumInterval: '1 minute',
             backoffCoefficient: 2, maximumAttempts: 5 },
    startToCloseTimeout: '1 minute',
  });
```

**The handlers stay in `apps/worker`, beside the activities, and the runtime is
injected into them.** An earlier draft moved them into `packages/jobs`, which
forced a question with no cheap answer: `typeof activities` is
`apps/worker/src/activities/index.ts`, so a handler in the package would make
the *package* resolve types from an *app* — a type-only import is still an
import, and it inverts the dependency the workspace graph declares. Fixing that
means declaring all 69 activity signatures in the package and having the worker
`satisfies` them: safe, because drift becomes a compile error, and a large
interface to maintain forever.

Injecting the runtime instead costs nothing and needs none of it. `ctx.steps<A>`
is generic over whatever the caller passes, so `ctx.steps<typeof activities>`
stays legal *in the worker*, where `activities` already lives; the package
never names an activity. What both runtimes share is the contract and the
context, which is the part that actually has to be common — and the enterprise
adapter still consumes the handlers from the worker image (§8.4), so nothing
that needed them loses them.

- On Temporal, `ctx.steps` **is** `proxyActivities` — same durable retries, same
  timeouts, byte-for-byte the same behaviour.
- On BullMQ, `ctx.steps` returns the activity functions wrapped in an
  in-process retry loop with the same backoff maths and an `AbortSignal`-based
  timeout.

`ctx.log` replaces `log` from `@temporalio/workflow` (Pino on BullMQ). A shared
`JobFailure` replaces `ApplicationFailure`; `JobFailure.nonRetryable(…)` maps to
`ApplicationFailure.nonRetryable` on one side and BullMQ's `UnrecoverableError`
on the other. That is the entire coupling surface — four imports across eight
files.

The consequence worth stating plainly: **the retry semantics differ even though
the configuration is identical.** Temporal's activity retry survives a worker
crash; the BullMQ wrapper's does not — a crash mid-backoff loses the retry state
and BullMQ retries the *whole job* from the top instead. See *What we lose*.

### 3. Concurrency does not translate one-to-one

`apps/worker/src/worker.ts` sets `maxConcurrentActivityTaskExecutions: 50`. That
is fifty *activities*, and one ingest is roughly twenty sequential activities —
so it never meant fifty concurrent files. BullMQ's `concurrency` counts whole
jobs. Copying the 50 across would raise real concurrency several fold in one
commit.

The default was `10`, the conservative read of
[the 2026-09-05 load test](../lessons/worker-concurrency-load-test-2026-09-05.md)
— 20 concurrent ingests, twice, zero failures, and a lesson that explicitly
refused to call 20 a safe ceiling.

**D2 measured it and 10 was the wrong conservative number**, so the default is
now `20`. On the same twenty-document upload, 10 gave a median of 24.9s per
document against Temporal's 12.5s — the whole difference falling before
parsing began, with identical parse and embed times — and 20 gives 12.3s. Conservatism that costs
parity with the engine being replaced is not caution, it is a regression with a
reason attached. Twenty is still not a proven ceiling: it is the number that
matches what Temporal did with the same files, and a deployment whose provider
rate limits bind sooner lowers it with `WORKER_CONCURRENCY`. See
[the measurement](../lessons/bullmq-matches-temporal-at-equal-concurrency-2026-09-16.md).

### 4. Cancellation becomes a database fact

Today cancellation is a Temporal signal setting an in-memory `cancelled` flag
that `checkCancelled()` reads at checkpoints
([`apps/worker/src/workflows/signals.ts`](../../apps/worker/src/workflows/signals.ts)).
BullMQ has no signals, and inventing a Redis-only equivalent would give the two
runtimes two different cancellation mechanisms — which, once one of them lives
in another repository, means the enterprise adapter carries a behaviour the OSS
tests never exercise.

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

The org check is a `docgen-{orgId}-` prefix test on the run id. It keeps working,
because run ids are unchanged and BullMQ takes a caller-supplied `jobId`.
Rejected alternative: persisting the generated document's result in Postgres and
dropping the runtime status call entirely — cleaner, and the right long-term
shape, but it is a schema change and a second capability wearing this spec's
name.

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
two nightly jobs go on a dedicated `ragen-maintenance` queue, and each
scheduled run takes a deterministic `jobId` — `${scheduleId}-${YYYY-MM-DD}`, a
hyphen and **not** a colon, because
[BullMQ forbids `:` in a custom job id](https://docs.bullmq.io/guide/jobs/job-ids)
(it is Redis's own key separator) and rejects an id that is only digits. A
duplicate enqueue is then dropped by BullMQ's id uniqueness.

Worth checking once rather than assuming, since §5 reuses run ids as job ids:
the ids we already generate are `doc-${nanoid()}`, `doc-${randomUUID()}` and
`docgen-${orgId}-${nanoid()}`. No colons, never all-digits, so the "run ids are
unchanged" claim survives the rule that just cost this spec a separator.

`concurrency: 1` on the queue is **per `Worker` instance**, so it does not by
itself stop two nightly runs overlapping once the chart runs more than one
worker replica (`apps.worker.replicas` defaults to 1 and is not pinned). The
queue therefore also sets BullMQ's global concurrency to 1, which is enforced
across every consumer, and the per-day `jobId` remains the second line of
defence.

### 7. The queue admin panel is not optional any more

Temporal UI on port 8080 is how anyone currently sees what the worker is doing,
and after Phase E it is not in the install. bull-board therefore ships in the
same phase as the runtime, not later.

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
route handler; that is a follow-up step, named in Phase E, not a reason to delay
the panel.

### 8. What "Temporal is still supported" is promised to mean

A runtime that nothing runs is abandoned with a package name. The promise is
therefore specific, and it is held in two stages, because the adapter stays
here until there is an image to layer it onto.

**In Phase E, while the adapter is still in this repository:**

1. **One package, and no `@temporalio/*` outside it.** `packages/jobs-temporal`
   holds the whole family; the architecture guard says so, and the worker image
   does not install that workspace — so the artifact we ship carries no
   Temporal SDK while the source still supports it.
2. **The contract is an import, not a copy.** `@ragenai/jobs` is a workspace
   dependency. This is the free half; Phase G is where it stops being free.
3. **CI runs the real thing.** The worker integration suite runs against a real
   Temporal container as well as a real Redis, nightly. That job failing is how
   we learn that a change to `ctx.steps` broke durable retries.

**In Phase G, once `ragen-worker` is published and the adapter moves:**

4. **One artifact, not a fork.** `ragen-enterprise` ships
   `@ragenai/jobs-temporal` and a Dockerfile that is `FROM` the OSS worker
   image plus the adapter. It contains no handler, no activity and no pipeline
   — those come from the image. Rejected alternative: an enterprise worker
   application with its own copy of the activities, which is `apps/worker-lite`
   again with a licence attached.
5. **The contract comes from inside the image.** The runtime image's
   `/app/node_modules/@ragenai/*` are symlinks into `/app/packages/`, which is
   copied in, so `@ragenai/jobs` resolves there with its built `dist`. The
   adapter declares it as a peer dependency it never installs and compiles
   against the contract the image actually ships — no registry, and no version
   number that can skew from the thing it type-checks against.
6. **The parity job moves with the package**, and a breaking change to
   `JobContext` becomes a breaking change for an out-of-repository consumer.
   That is the cost this spec adds, and it is deferred, not avoided.

[ADR-32](../adrs/32-token-vault-and-mcp-stay-separate.md) — *measure drift
first* — is the rule that applies to a sibling repository, and this change
spends that budget deliberately rather than by accident. The thing that keeps
drift bounded is (4): the enterprise artifact is a thin layer over an image we
build anyway. Until that image exists, the drift is zero, because nothing has
left.

### 9. Which variables are required follows the runtime

`REDIS_URL` and `TEMPORAL_SERVER_ADDRESS` are not both mandatory, and they are
not both optional either: each is required exactly when its runtime is
selected. Today the worker's schema demands the Temporal variables
unconditionally, which is correct only while Temporal is the only runtime —
after Phase E it would refuse to start a deployment that does not run Temporal
at all.

`WORKER_RUNTIME` therefore becomes a **provider seam** in `@ragenai/env`, like
storage, encryption and speech before it: the discriminant, one variant per
runtime, and each variant's `required` list. `bullmq` requires `REDIS_URL`;
`temporal` requires `TEMPORAL_SERVER_ADDRESS` and whatever else that path
cannot start without.

Two things follow from the seam machinery rather than from anything new here,
and both are the reason to use it instead of a hand-written `superRefine`:

- **The rule has to be merged with the fragment or it validates nothing.**
  That is ADR-37's rule and `provider-fragments-carry-their-rules.test.ts` is
  what enforces it. A `workerRuntimeRules` that no schema calls is the failure
  mode this repository already paid for once, in #1116.
- **The generated configuration reference says which is which for free.** It
  renders a section per variant from the same table, so an operator reading
  the reference sees "required" against `REDIS_URL` under BullMQ and against
  the Temporal variables under Temporal — without either being described as
  required in general, which is what a single flat list would have to claim.

This lands with Phase C's `WORKER_RUNTIME=bullmq` (the point at which a
deployment can select the other branch), not with Phase E, so that the first
install to choose BullMQ is told about `REDIS_URL` at boot rather than at the
first upload.

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

- **Rename `apps/worker` to `apps/worker-temporal` and add a second app.** The
  fastest way to honour "keep the current one", and the pipeline forks at the
  first ingest change — two copies of 69 activities, one of which nobody runs.
  ADR-26 and ADR-33 are the receipts. Rejected; the adapter is what moves.
- **A second app, `apps/worker-lite`.** The same objection arrived at from the
  other direction. Rejected for the same reason.
- **Delete Temporal outright.** Tempting once it is not the default: no package
  to publish, no second CI, no `JobContext` compatibility promise. Rejected
  because the seam makes keeping it cheap, because replay is a real enterprise
  ask, and because a maintained Temporal adapter is the only thing that keeps
  the parity claim in Phase D testable a year from now.
- **Keep both runtimes in this monorepo as equals.** This spec's original shape.
  Rejected by the 2026-09-15 decision above: two supported defaults means every
  worker change is reviewed twice, forever, and the dual-runtime guard becomes a
  permanent tax on a path almost nobody runs.
- **Seam only inside the worker**, with `apps/web`/`apps/api` still speaking
  Temporal. Smallest diff and it does not solve the problem: you still cannot
  run Ragen without Temporal.
- **pg-boss or graphile-worker.** Postgres-native, no Redis, genuinely lighter
  again — but neither is the thing the ecosystem knows, which is half the stated
  goal, and BullMQ's own Postgres backend now reaches the same place without a
  second library.
- **Inngest / Trigger.dev / Restate.** Managed or semi-managed durable
  execution. Wrong direction for software whose point is running on a customer's
  own infrastructure.
- **BullMQ's Postgres backend immediately.** The lightest possible stack, and
  the newest code path in a library we would be adopting the same week. It
  becomes a second seam level once the Redis path is boring (Phase F).
- **Keep Temporal, shrink it instead** (drop the UI, share the DB, slim the Helm
  chart). Saves a container and none of the conceptual weight, and the
  SDK-version guard stays.

### What we lose, stated plainly

1. **No replay.** A worker crash at activity 15 of 20 re-runs the job from
   activity 1. Every activity must be idempotent, and re-running costs real
   money — the summary and RAG-score LLM calls are re-issued.
2. **`addDocumentsToVectorStore` is append-only.** Qdrant point ids are random
   uuids, so a re-run after a crash *adds* a second copy of every chunk rather
   than replacing it — this is why `reindexDocumentVersion` deletes first and
   says so in its own comment. On Temporal this cannot happen (the workflow
   resumes past the completed step). On BullMQ it can. **Ingest must delete this
   file's existing vectors before writing, on every run.** This is the single
   highest-risk item in the spec and it gets its own step (C3).
3. **No workflow history.** No per-activity event log, no "what did attempt 3
   receive". bull-board shows job state, payload, attempts and the failure
   stack; OTel spans cover the rest, worse.
4. **Retry state is not durable** — see §2.
5. **Job payloads live in Redis.** `optimizeDocument` and
   `reindexDocumentVersion` carry the *entire document text* in the payload
   today. Under Temporal it sits unencrypted in Temporal's Postgres; under
   BullMQ it sits unencrypted in Redis, which in this stack has no eviction
   policy set and no AOF. Not a regression, but it is the moment to fix it: pass
   identifiers, read the text inside the job (step C4).
6. **Redis becomes required.** It is optional today — `redis.enabled: false` in
   Helm, with a comment calling it "API rate limiting only. The apps run without
   it." After Phase E the worker does not start without it, which is a new hard
   dependency for every install and the reason Phase F exists.
7. **Rollback gets worse in two steps.** Through Phase E, reverting is
   `WORKER_RUNTIME=temporal` plus a worker image built with that workspace
   installed — the source is still here. After Phase G the Temporal path is a
   package in another repository, so rolling back means pulling a different
   image. That is a deliberate trade for not maintaining two defaults, and it
   is what makes Phase D's parity evidence the thing the decision rests on.

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `prisma/schema.prisma` | **None.** `UserFile.workflowId` is reused as the run id; only its comment changes | n/a — and that is the cheap case |
| `packages/jobs` (new) | The seam and the BullMQ adapter — contract, runtime resolution, retry semantics | package tests + web/api/worker builds; `tests/architecture/jobs-seam-is-the-only-runtime-import.test.ts` |
| `packages/jobs-temporal` (new; extracted in Phase G) | The Temporal adapter, sole holder of `@temporalio/*`, and the one workspace the worker image does not install | its own tests; the same architecture guard; `a-scoped-dockerfile-installs-every-workspace-dep.test.ts` |
| `packages/env` | `WORKER_RUNTIME` becomes a **seam with its own rule** (§9), plus `WORKER_CONCURRENCY` and `WORKER_ADMIN_*` | `provider-fragments-carry-their-rules.test.ts`, `config-groups`, `ragen-config-is-generated.test.ts`, `config-reference-is-generated.test.ts` |
| `packages/create-ragen-app` | Manifest keys, the compose service list, the outro | `create-ragen-app-manifest-is-current.test.ts` + `installer.yml` |
| `apps/web/src/libs/temporal/` | Thin re-export in Phase A, **deleted** in Phase E | build + the existing command tests |
| `apps/api/src/temporal/` | `TemporalClientService` → `JobsService`, directory renamed to `jobs/`; the hand-synced job-name copy deleted | `apps/api` unit tests, `shared-contracts-are-not-recopied.test.ts` |
| `apps/worker/src/workflows/` | Becomes `handlers/`: the same pipelines, runtime-neutral and in place; `signals.ts` deleted (§4) | worker integration suite |
| `apps/worker/src/activities/` | Unchanged, except C3/C4 | worker tests + D1 |
| auth / tenant scoping | Unchanged. The `docgen-{orgId}-` prefix check and every `organizationId` filter stay as they are | guard tests, `ragen-tenant-scope-audit` |
| `tests/architecture/the-temporal-family-moves-together.test.ts` | Re-pointed at `packages/jobs-temporal` in Phase E, and leaves with it in Phase G. The family still has to move as one version; it just has one home | itself |
| `docker-compose*.yml`, Helm, Terraform | Temporal removed (Helm template deleted, Terraform variables dropped); Redis required, `noeviction` + AOF | `docs-name-the-published-service-ports.test.ts`, `helm.yml`, `check:config-paths` |
| `.github/workflows/ci.yml`, `e2e.yml`, `helm.yml` | The four dummy `TEMPORAL_*` variables in both suites, e2e's `paths-ignore` comment, and `helm.yml`'s `--set config.TEMPORAL_SERVER_ADDRESS` | the workflows themselves; `every-pull-request-runs-ci.test.ts` |
| `README.md`, the other two 2026-09-14 specs | The programme framing and the shared table — **already corrected** with this rewrite; E4 keeps the service lists true as the phases land | review — no test asserts prose, which is why it is in a step |
| `webamigos/ragen-enterprise` | Receives the adapter package, its Dockerfile and its CI | that repository's own CI (§8) |

## Data model

**No migration.** Deliberately:

- `UserFile.workflowId` (`String?`) already holds a caller-supplied id and
  BullMQ accepts a caller-supplied `jobId`. Rows written under Temporal stay
  valid; the column comment stops saying "Temporal".
- Cancellation reuses `parsingStatus` / `embeddingStatus`, which already have a
  `CANCELLED` member.
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
| Redis absent entirely | The worker refuses to boot with one message naming `REDIS_URL`. It is no longer optional, and a worker that starts and quietly processes nothing is the worse outcome |
| Worker crashes mid-job | Job is redelivered and re-runs from the top. Safe only because of C3/C4 idempotency work |
| Event loop blocked by CPU work (sharp, resvg, pdfium, xlsx) | The job lock is renewed on a timer; a blocked loop lets it expire, BullMQ calls the job stalled and **runs it a second time in parallel**. `lockDuration` raised to 5 min, `maxStalledCount: 1`, and CPU-bound activities are candidates for sandboxed processors |
| A 10-minute Docling parse | Fine while it awaits I/O — the lock renews. Covered by the same `lockDuration` setting |
| Two nightly runs overlap | Global concurrency 1 on `ragen-maintenance` (per-worker `concurrency: 1` is not enough with more than one replica) + a per-day deterministic `jobId` |
| Cancel arrives after the job finished | Conditional `updateMany` matches nothing; the command returns "already finished" instead of throwing `WorkflowNotFoundError` |
| Cancel races a status write | The `notIn` guard means a late activity cannot overwrite CANCELLED |
| Docgen result polled after retention expiry | `getRun` returns `unknown`; the route answers 404 exactly as it does today for an aged-out workflow |
| `WORKER_RUNTIME=temporal` with the adapter not installed | `getJobRuntime()` throws at boot with the package name and the install command — not a module-resolution stack trace |
| Producers and worker configured differently | Producers write to one engine only, so the other's jobs never run. The worker refuses to start if it finds a live queue for the runtime it is *not* configured for |
| Temporal schedule left behind after the switch | Keeps firing against a worker that no longer listens. The `--delete` flag on both scripts is a required rollout step — the same trap already documented in those scripts |
| `@ragenai/jobs` changes `JobContext` without a major bump | The enterprise adapter compiles against a contract it no longer satisfies. Its nightly CI is the only detector, which is why §8.3 is part of the definition of done |

## Phases

Each phase leaves the application working.

### Phase A — the seam, still on Temporal

- [x] **A1.** Create `packages/jobs` (`contract.ts`, `runtime.ts`, `retry.ts`)
      and `packages/jobs-temporal` (the adapter). `WORKER_RUNTIME` exists in
      `@ragenai/env`, defaults to `temporal`, and resolves the adapter by
      dynamic import.
- [x] **A2.** Move the `Workflow` enum and payload types out of `apps/web`'s
      contracts and delete the hand-synced copy in
      `apps/api/src/temporal/temporal.consts.ts`; both re-export from the
      package. Add `jobs-seam-is-the-only-runtime-import.test.ts`: every job
      name has a handler, and no `@temporalio/*` import exists outside
      `packages/jobs-temporal`.
- [x] **A3.** Port the eight workflow bodies to `(payload, ctx)` handlers, in
      place in `apps/worker/src/handlers/`, using `ctx.steps` / `ctx.log` /
      `JobFailure`. Behaviour identical; the worker registers them with
      whichever runtime it resolved. The guard in A2 gains the direction that
      keeps this honest: nothing in `packages/*` imports from `apps/*`.
- [x] **A4.** Replace the nineteen producer call sites in `apps/web` and
      `apps/api` with `getJobRuntime().start(...)`. `apps/api/src/temporal/`
      becomes `jobs/`; `apps/web/src/libs/temporal/` becomes a re-export shim.

### Phase B — cancellation and status stop being Temporal-shaped

- [x] **B1.** `cancelFileEmbeddingCommand` writes CANCELLED conditionally;
      `ctx.checkCancelled()` reads the row. Delete the signal and query
      definitions. Still on Temporal.
- [x] **B2.** The docgen status route goes through `jobs.getRun(runId)`.

### Phase C — the BullMQ adapter

- [x] **C1.** BullMQ adapter: one queue per job name plus `ragen-maintenance`;
      `concurrency`, `attempts`, backoff and timeouts derived from the same
      options object the Temporal adapter reads; `lockDuration: 300_000`;
      retention policies; SIGTERM/SIGINT graceful `worker.close()`.
- [x] **C2.** `WORKER_RUNTIME=bullmq` accepted, and `WORKER_RUNTIME` becomes a
      seam in `@ragenai/env` with a rule per variant (§9): `REDIS_URL` required
      under `bullmq`, the `TEMPORAL_*` variables under `temporal`, neither
      required in general. The rule is merged with the fragment in every app
      that reads it, or it validates nothing. Worker boot additionally asserts
      the Redis `maxmemory-policy` and refuses to start on an evicting
      instance.
- [x] **C3.** **Ingest deletes this file's existing vectors before writing**, on
      every run, on both runtimes. Without this a redelivered job duplicates
      every chunk. Covered by a test that runs `runFileEmbeddings` twice and
      asserts the Qdrant point count does not double.
- [x] **C4.** Shrink payloads to identifiers: `runFileEmbeddings` takes
      `{ fileId, orgId }` and re-reads the row; `optimizeDocument` and
      `reindexDocumentVersion` stop carrying document text. Fixes staleness and
      keeps document content out of Redis.
- [x] **C5.** Port both schedule scripts to `upsertJobScheduler`, keeping
      `--delete` and the per-day `jobId`. Both keep their Temporal path while
      the adapter is still in-repo.
- [x] **C6.** bull-board on `WORKER_ADMIN_PORT` behind Basic Auth, off unless
      credentials are set; `/health` unauthenticated. Wire `bullmq-otel` into
      the existing collector.

### Phase D — prove parity, once

- [x] **D1.** Worker integration suite against a real Redis (compose service in
      CI): each of the eight jobs enqueued and completed, retries, cancel,
      schedule fire, stalled-job recovery, and the C3 double-run assertion. The
      suite is written runtime-agnostic, because §8.3 reuses it against Temporal
      from the other repository.

  Landed as `apps/worker/test/jobs-integration/` (`npm run worker:test:jobs`,
  the `Jobs Integration` job in `ci.yml`). Three things it turned up or
  settled, because each is a decision the next phase inherits:

  - **It found a real defect on its first run.** `getRun` read the job and
    then its state, so a run finishing between the two reads answered
    `completed` with a `null` result — the docgen route's one consumer would
    show a generated document with no file. The adapter's unit tests cannot
    see it: they mock `Job.fromId`, so both reads are the same object. See
    [the lesson](../lessons/a-status-read-in-two-round-trips-reports-a-result-it-never-saw.md).
  - **Runtime-agnostic means the assertions, not the harness.** The suites
    touch `JobRuntime` and a `JobRuntimeHarness` interface only; the harness
    is the engine-specific half and holds one implementation today.
    `WORKER_RUNTIME=temporal` selects a harness that does not exist yet and
    **fails**, rather than falling back — a parity suite that quietly tested
    one engine twice would report parity it never measured. Writing the
    Temporal harness is part of the nightly job in §8.3.
  - **`lockDuration` and `stalledInterval` became overridable**, and nothing
    in the application overrides them. Five minutes is correct and
    untestable in a suite; without the override `maxStalledCount: 1` could
    only have been asserted as a constant, which is not evidence that a
    stalled job is redelivered exactly once.
- [x] **D2.** Run the [2026-09-05 load test](../lessons/worker-concurrency-load-test-2026-09-05.md)
      method on both runtimes, same day, same stack, and record the numbers in a
      lesson. Parity here means "no worse", measured — not assumed. This is the
      evidence the Phase E decision rests on. It stays reproducible here until
      Phase G, which is one more reason the adapter's move is worth deferring
      rather than rushing.

  **Done, 2026-09-16: [the numbers](../lessons/bullmq-matches-temporal-at-equal-concurrency-2026-09-16.md).**
  416 ingests, both runtimes, one machine, one afternoon, zero failures. On the
  same twenty-document upload, BullMQ's median was **24.9s against Temporal's
  12.5s at a concurrency of 10**, and **12.3s against 12.5s at 20**. Two things
  the measurement supports: the difference sat entirely *before parsing began*
  — the parse and embed medians are identical on both engines — and raising the
  concurrency setting removed it. `concurrency` counts whole jobs, where
  Temporal's 50 counted *activities*, about twenty per ingest, so the two
  numbers were never the same unit.

  **Acted on: `DEFAULT_CONCURRENCY` is 20**, and the installer writes the
  variable explicitly so the knob is findable — see §3 and E2/E3. At a
  concurrency of 10 a deployment would have met that 2x on its first bulk
  import and read it as the runtime's fault, because the runtime is what
  changed. At
  one file BullMQ is the faster of the two (6.9s against 10.0s).

  **The instrument:**
  `apps/worker/src/scripts/jobs-load-test.ts` enqueues through the seam, so
  `WORKER_RUNTIME` chooses what it measures, and
  [a runbook](../runbooks/worker-runtime-load-test.md) has the procedure. It is
  deliberately not the 2026-09-05 script: that run had no lower-concurrency
  baseline and no repetitions, which is why its own lesson refused to read
  "~2x at the tail" as a fact about concurrency. This one takes levels and
  repetitions, and splits each file's time into queue wait, parse and embed
  from timestamps the pipeline already writes — so a difference can be
  attributed to the engine or to the providers rather than assigned to
  whichever one is under review.

- [ ] **D3.** A `ragen:up:full` variant with no Temporal at all, and a clean
      clone that ingests a document, cancels one, and generates a document with
      `WORKER_RUNTIME=bullmq`.

  The variant was `npm run ragen:up:bullmq`, an overlay that moved both Temporal
  services behind a profile — deliberately an overlay rather than a `profiles:`
  key in the base file, because changing what a plain `docker compose up`
  starts was E2's decision to make. **E2 has since made it**, so the overlay is
  gone and `ragen:up:full` *is* the Temporal-free stack. The manual half is a
  section in [the regression checklist](../regression-checklist.md); it is the
  part no automated suite reaches, since D1 stubs the activities and `e2e.yml`
  starts no worker.

### Phase E — BullMQ is the worker; Temporal stays here, out of the image

Gated on D2's numbers. The adapter does not move in this phase — see *Answered*
— so what changes is what an install runs, not where the code lives.

- [x] **E1.** [ADR-44](../adrs/44-bullmq-is-the-worker-runtime.md): *BullMQ is
      the worker runtime; durable execution is an enterprise adapter*. It
      supersedes [ADR-07](../adrs/07-temporal-document-processing.md), says why
      the 2024 rejection no longer applies — the coupling it rejected went away
      with ADR-26, not with this change — and records the drift budget ADR-32
      asks for: zero while the adapter is here, bounded by shape afterwards,
      with the nightly parity job as the detector.
- [x] **E2.** The default concurrency is decided (`DEFAULT_CONCURRENCY` is 20 —
      see §3), and Temporal leaves the default install: compose's `temporal` and
      `temporal-ui` deleted, Redis gaining `--maxmemory-policy noeviction` and
      AOF; Helm's `temporal.yaml` deleted with `redis.enabled: true` and its
      "rate limiting only" comment rewritten; the Terraform variable dropped;
      both CI suites losing the four dummy `TEMPORAL_*` variables and
      `helm.yml` its `--set`.

  **The default runtime moves with them, and had to.** `resolveWorkerRuntime`
  returned `temporal` for an unset variable and the seam's `defaultVariant`
  said the same, so removing the container without flipping the default would
  have left `docker compose up` followed by `npm run worker:dev` connecting to
  a Temporal that is not there. The two are one change.

  `docker-compose.no-temporal.yml` and `ragen:up:bullmq` are deleted with it:
  D3's overlay existed to preview this state, and `ragen:up:full` *is* that
  state now.

  **What this does not do** is make the producers validate the runtime's own
  requirement. `REDIS_URL` is required under `bullmq` by the seam, but only
  `apps/worker` merges that rule — so a web or api deployment without Redis
  fails at the first upload rather than at boot. Filed separately; it predates
  this change, which only moves which variable is the silently missing one.
- [x] **E3.** `create-ragen-app`: `WORKER_RUNTIME=bullmq`, Temporal out of the
      backing-services list and the outro, `REDIS_URL` promoted to required, the
      port-collision check kept honest.

  **"Promoted to required" became "written by the selection".** `REDIS_URL` was
  already uncommented in `.env.example`, so leaving it there would have made this
  step prose. The runtime choice now writes the variable its own runtime cannot
  start without — `REDIS_URL` under BullMQ, `TEMPORAL_SERVER_ADDRESS` under
  Temporal — which is what E2 and #1224 together made load-bearing: a scaffold
  that picks a runtime and not its address hands over an install that refuses to
  boot. The seam is now the third entry in
  `create-ragen-app-knows-the-provider-seams.test.ts`, so "the wizard asks for
  every credential the seam makes mandatory" is checked rather than reviewed.

  **The Temporal address is prompted, not defaulted.** Its `localhost:7233` is
  offered as a prefilled answer: right on a laptop, silent everywhere else, and
  after E2 it names a server the operator runs rather than one this install
  starts. Selecting Temporal also warns that nothing below will start one.

  **The unattended default flipped with it.** `--yes` and `--provider` used to
  answer Temporal on the grounds that a flag should not pick an engine; the same
  reasoning now answers BullMQ, because the shipped default is what "accept the
  defaults" means and the other answer scaffolds a worker pointing at nothing.
  The outro grew `npm run worker:dev`: with ingest on a queue nobody drains, an
  upload is accepted and never parsed.

  **`WORKER_CONCURRENCY` is already written by the installer** (decided
  2026-09-16, shipped ahead of this phase because it only fires when an
  operator explicitly picks BullMQ, which they can do today). It writes an
  explicit `20` — the same number `DEFAULT_CONCURRENCY` now carries in code
  (§3), written out rather than inherited silently — and a constant rather than
  something derived from `os.cpus()`: an ingest is almost entirely waiting — on
  storage, on the parser, on the embedding provider — so core count predicts
  nothing about how many can be in flight, and a hardware-derived number would
  look principled and mean less. It lands in `.env` rather than being applied
  silently, because the ceiling that really binds is the model provider's rate
  limit and the operator is the only one who knows it.
- [x] **E4.** Docs: `docs/companion-services.md`, `docs/architecture.md`, the
      generated configuration reference, `AGENTS.md` (Task Router row, Core
      Surfaces, Commands), `apps/worker/AGENTS.md` (the "Temporal-Specific
      Constraints" section becomes BullMQ's operational rules), and the README's
      service table and its ingest description, which still says a Temporal
      workflow takes over.

  The generated configuration reference is the one half that is not in this
  repository — it regenerates from `main` into `ragen-docs`.

  **The sweep found three things that were not prose.** `@/temporal/*` in
  `apps/web/tsconfig.json` pointed at `apps/web/temporal/src`, a directory that
  does not exist and that nothing imports — deleted from the config and from
  AGENTS.md's alias list. `apps/web/src/libs/temporal/` is **already gone**, so
  E5 owes only the `@temporalio/*` dependencies. And `AGENTS.md` is 109 bytes
  under its budget after this, which is the next thing to give: the sweep spent
  most of the remaining slack.

  **The constraints section is now two lists and a shared rule.** What both
  engines impose — plain, serialisable payloads — leads; then BullMQ's own,
  which are the ones with teeth: an evicting Redis is refused at boot, a
  blocked event loop becomes a *duplicate parallel run* (hence the five-minute
  lock and `maxStalledCount: 1`), retries belong to the step rather than the
  job, concurrency counts whole jobs, more than one worker is fine, and a
  finished job stays readable for an hour because `getRun` is polled. Temporal's
  three keep their own subsection.
- [ ] **E5.** Delete what the seam made dead: `apps/web/src/libs/temporal/`,
      and the `@temporalio/*` dependencies from `apps/worker`, `apps/api` and
      the root manifest — they belong to `packages/jobs-temporal` now, which is
      where `the-temporal-family-moves-together.test.ts` and dependabot's
      `temporal` group start pointing instead of being deleted. That family
      still has to move as one version; it just has one home.
- [ ] **E6.** Take Temporal out of the **image**, not the repository: the
      worker Dockerfile's `npm ci --workspace=…` list omits
      `@ragenai/jobs-temporal`, and
      `a-scoped-dockerfile-installs-every-workspace-dep.test.ts` is the check
      that this stays deliberate rather than becoming a missing entry. An
      install that wants durable execution builds from source until Phase G.
- [ ] **E7.** Link bull-board from `apps/admin`, and open a follow-up for
      proxying it behind Better Auth per ADR-35.

### Phase F — later, not now

- [ ] **F1.** `BULLMQ_BACKEND=redis|postgres` as a second seam level, with
      `runMigrations()` in the deploy path and the `bullmq` schema isolated.
      This is what makes the light-profile claim true, and *What we lose* #6 is
      what makes it worth scheduling rather than filing.

### Phase G — the adapter leaves, once there is an image to layer it onto

Gated on publishing `ragen-worker`, which is not part of this spec and has no
date. Until then Phase E's arrangement is the steady state, and it is a working
one: durable execution is available to anyone who builds from source.

- [ ] **G1.** Publish the worker image (its own change — every app image would
      benefit, and self-hosting today means building four of them from source).
- [ ] **G2.** Move `packages/jobs-temporal` to `webamigos/ragen-enterprise`
      with its Dockerfile (`FROM` that image), the nightly parity job, the
      `temporalio` dependabot group, and the two schedule scripts' Temporal
      paths. The adapter takes `@ragenai/jobs` as a peer dependency resolved
      from inside the base image — nothing is published to npm (see §8.5).
- [ ] **G3.** Drop `@ragenai/jobs-temporal` from this repository's workspaces
      and from the architecture guard's allow-list, so a re-introduced
      `@temporalio/*` import fails here. The seam's dynamic specifier and its
      ambient declaration are what keep `tsc --build` working with the package
      gone (§1) — so this step ends with a build of a default install that has
      no adapter installed, which is the only thing that proves it.
- [ ] **G4.** Check that
      [`docs/open-core-boundary.md`](../open-core-boundary.md) still describes
      what that repository holds; it already records that `ragen-enterprise` is
      Apache-2.0 and not a commercial path.

## Testing

Per the Testing Requirements in [`AGENTS.md`](../../AGENTS.md):

- **Unit** (`packages/jobs`): the retry/backoff wrapper against the same policy
  objects the Temporal adapter passes through; timeout behaviour; the name
  registry; `JobFailure` → `UnrecoverableError` / `ApplicationFailure` mapping;
  schedule id and cron construction; `getJobRuntime()`'s missing-package error.
  These are thin binding files, which `AGENTS.md` calls out as the ones most
  often left untested.
- **Architecture**: `jobs-seam-is-the-only-runtime-import.test.ts` — every job
  name has a handler, and `@temporalio/*` appears in exactly one package.
  `the-temporal-family-moves-together.test.ts` keeps its invariant and follows
  the family to `packages/jobs-temporal` in E5.
- **Integration** (`apps/worker`, real Redis): D1's list. This is the gate,
  because **no e2e test can be one.** `.github/workflows/e2e.yml` builds and
  starts `apps/api` and the web app, and starts no worker at all — nothing
  consumes a queue during that suite — and it path-ignores `apps/worker/**` so
  a worker-only change does not even trigger it. So no `p0` e2e can cover this,
  and pretending otherwise would be the failure mode `AGENTS.md` warns about.

  Stated that way on purpose: the same workflow also sets four dummy
  `TEMPORAL_*` variables, which is the *evidence* people usually cite for "the
  suite does not run the worker" — and E2 deletes them. The reason has to
  outlive them, and it does: a process nobody starts cannot be under test.
- **Both runtimes, nightly.** While the adapter lives here, the same
  integration suite runs against a real Temporal as well as a real Redis, in
  the nightly job — the cheap version of §8.3, available precisely because
  nothing has been extracted yet. It moves to `ragen-enterprise` with the
  package in Phase G, and that is when it starts costing something.
- **Manual**: a new row in [`docs/regression-checklist.md`](../regression-checklist.md)
  — upload, cancel mid-ingest, re-embed a folder, generate a document, roll a
  version back — run once per runtime before Phase E.
- **Measurement**: D2, recorded as a lesson.

## Rollout and rollback

**Per deployment, by env var, until Phase E.** `WORKER_RUNTIME` is read by the
worker and by every producer; they must agree, and the worker logs the resolved
value once at boot next to the concurrency and lock settings.

**Order that matters.** Phases A and B ship with no behaviour change and no
operator action. Phase C is opt-in. Phase E changes the default and removes the
engine, and the flip is: drain (stop producers, let in-flight runs finish,
confirm no `PROCESSING` files) → delete both Temporal schedules with the
`--delete` scripts → switch `WORKER_RUNTIME` → start the worker → confirm both
schedules exist in bull-board.

**Rollback.** Before E5/E6: set `WORKER_RUNTIME=temporal` and restart, after the
same drain — there is no migration to unwind, which is the point of keeping the
schema untouched. After E6: install `@ragenai/jobs-temporal` (or run the
enterprise worker image), then the same procedure. What rollback does *not*
recover is in-flight BullMQ jobs; they stay in Redis, unread, and the affected
files need a re-embed. Re-create the Temporal schedules with the same scripts.

**The one-way doors.** C3 and C4 change ingest and payload shape for both
runtimes and stay even if BullMQ were abandoned, because they are correct on
Temporal too. E2 is the other one: deleting the compose service and the Helm
template is a revert away in git, but an operator who has already dropped the
Temporal schema from Postgres is not.

## Sources

- [BullMQ changelog](https://docs.bullmq.io/changelog) — v6.0.0 (2026-07-30), pluggable backends, repeatable jobs removed
- [BullMQ — PostgreSQL backend](https://docs.bullmq.io/guide/postgresql) — setup, `runMigrations()`, ~1.5–2× throughput gap
- [BullMQ — Going to production](https://docs.bullmq.io/guide/going-to-production) — `noeviction`, AOF, `maxRetriesPerRequest: null`, graceful shutdown
- [BullMQ telemetry](https://bullmq.io/news/241104/telemetry-support/) and [`bullmq-otel`](https://github.com/taskforcesh/bullmq-otel)
- [bull-board](https://github.com/felixmosh/bull-board) — supports BullMQ ≥ 5.56 and all of v6, including Postgres-backed queues
- [`bullmq@6.3.6` on npm](https://registry.npmjs.org/bullmq/latest) — MIT, optional peers `ioredis` / `pg` / `redis` / `bullmq-otel`
- [Best job queue alternatives (Inngest, 2026)](https://www.inngest.com/blog/best-job-queue-alternatives) — "Celery and BullMQ guarantee the message. Temporal guarantees the program."
- Internal prior art: `justnails-app` — `packages/queue`, `apps/worker/src/registry.ts`, `apps/worker/src/bull-board.ts`

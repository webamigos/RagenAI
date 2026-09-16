# Comparing the two worker runtimes under load

The procedure for **D2** of
[the worker-runtime spec](../specs/2026-09-15-bullmq-is-the-worker-runtime.md):
run the same ingest load against Temporal and against BullMQ, on the same stack
on the same day, and record the numbers. Phase E's decision — BullMQ becomes the
default and Temporal leaves the image — rests on this and on nothing else.

Parity here means **no worse, measured**. The only figure that exists today is
20 concurrent ingests on Temporal, from
[the 2026-09-05 run](../lessons/worker-concurrency-load-test-2026-09-05.md),
whose own conclusion was that one number at one concurrency level establishes
nothing. Do not flip the default before this is done.

## What it costs

Real provider calls: one embedding batch, one summary and one RAG score per
file, plus Presidio and Qdrant. The default matrix (`1,5,20` at three
repetitions, twice for the two runtimes) is 156 ingests of a ~500-word
document. Start with a single file to check the wiring before spending the
rest.

## Before you start

- The whole stack up, including Temporal **and** Redis:
  `npm run ragen:up:full`.
- Credentials that actually answer: `npm run gateway:preflight -- --probe`
  makes one real call per configured model.
- An organization to write into. The script creates its own project inside it
  and deletes what it made; it never deletes an organization and never deletes
  a Qdrant collection, because that collection is shared with every real
  document in the organization.
- Nothing else ingesting at the same time. A colleague uploading a folder
  during run 3 is indistinguishable from a slow runtime.

## The runs

The worker and the script must agree on `WORKER_RUNTIME` — a producer writes to
one engine only, so a mismatch means nothing consumes the jobs and every run
times out. The script prints the runtime it resolved; read that line.

**Temporal first**, because it is the baseline the comparison is against:

```bash
WORKER_RUNTIME=temporal npm run worker:dev
```

```bash
LOAD_TEST_ORG_ID=<org id> WORKER_RUNTIME=temporal \
  npx tsx apps/worker/src/scripts/jobs-load-test.ts \
  --levels 1 --repetitions 1
```

Check that run finished and cleaned up, then the full matrix:

```bash
LOAD_TEST_ORG_ID=<org id> WORKER_RUNTIME=temporal \
  npx tsx apps/worker/src/scripts/jobs-load-test.ts \
  --levels 1,5,20 --repetitions 3 --json /tmp/temporal.json
```

Then stop the worker, **drain** (no file left in `PROCESSING`), and repeat with
`WORKER_RUNTIME=bullmq` and `--json /tmp/bullmq.json`. A run in flight when the
variable changes is orphaned: the new runtime has never heard of it.

## Reading the result

The script reports, per level and repetition: the time the `start()` calls
themselves took, min / p50 / p95 / max per file, total wall time, failures, and
the median split of each file's life into **queue wait**, **parse** and
**embed**.

The split is the part that makes a difference attributable. The engine owns the
queue wait; the providers own parse and embed. A runtime that is worse at the
same concurrency should show it in the queue wait — if instead the embed median
moved, the two runs met different provider weather, and the comparison needs
repeating rather than reporting.

Three things to write down explicitly, because the 2026-09-05 run was reread
later as if it had claimed them:

- **Failures per level.** Zero failures at 20 is a fact about 20, not a
  capacity limit.
- **Whether the levels behave differently from each other**, not only whether
  the runtimes do. The single-file baseline is what tells you a 25-second p50
  is the cost of one document rather than the cost of concurrency.
- **The spread across repetitions.** If run-to-run variance at one level is
  larger than the gap between the runtimes, the honest report is "no difference
  this measurement can see", and that is a perfectly good D2 answer.

## Recording it

Add a lesson under `docs/lessons/` with the table, the date, the stack, and the
conclusion, then index it in [`docs/lessons.md`](../lessons.md) and tick **D2**
in the spec. Link the 2026-09-05 lesson so the two read as a series — the older
one asked for exactly this run, and a reader who finds only one of them will
draw the conclusion it warns against.

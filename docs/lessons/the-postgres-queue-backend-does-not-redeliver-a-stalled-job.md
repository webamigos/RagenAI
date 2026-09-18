---
title: 'BullMQ’s PostgreSQL backend did not redeliver a stalled job, and the worker’s whole idempotency story is shaped by the Redis one'
modules: ['worker', 'ci']
areas: ['architecture', 'testing']
topics:
  [
    'bullmq',
    'postgres',
    'worker-runtime',
    'stalled-jobs',
    'idempotency',
    'adr-44',
    'parity-testing',
    'measurement',
  ]
---

# BullMQ’s PostgreSQL backend did not redeliver a stalled job, and the worker’s whole idempotency story is shaped by the Redis one

**Context**: F1 of the worker-runtime spec adds `BULLMQ_BACKEND=redis|postgres` so an install can keep its queues in the database it already runs. The adapter change is small — a backend factory threaded through three construction sites — and every unit test passed. The jobs-integration suite was then pointed at a real PostgreSQL for the first time.

**Problem**: three of its twenty-four tests failed, and they were not a random three. Both stalled-job cases and the redelivered-ingest case failed: a job whose handler blocks the event loop past its lock is **not** redelivered on the PostgreSQL backend, at the settings where Redis redelivers it. Raising the lock from one second to five and the block from three seconds to fifteen changed nothing, so it is not a timing margin. The backend is not missing the capability either — it ships `moveStalledJobsToWait` and a `move_stalled_jobs_to_wait.sql` command — so something about how that sweep is driven differs, and what exactly was left unestablished.

Why the specific three matter more than the count: they are the same three the Temporal leg skips, which means "does an expired lock redeliver the job" is a property of the **datastore**, not of the runtime — and the suite's trait table had it keyed by runtime. It gave the wrong answer for one of the two backends behind a single name.

**Rule**: the worker's design is Redis-shaped in a way that does not travel. `lockDuration: 300_000`, `maxStalledCount: 1` and the rule that every activity must be idempotent all exist because on Redis *a blocked event loop runs the job twice* — which is why ingest deletes a file's chunks before every write. On the PostgreSQL backend that failure may instead be a job that is **stuck**, which needs the opposite handling. Do not port the reasoning with the code: when a seam gains a second implementation, re-run the tests that encode the *failure modes*, not only the ones that encode the happy path, and treat a difference there as a finding rather than a skip.

**And key a parity table by what actually varies.** `RuntimeTraits` was `Record<WorkerRuntime, …>` and had to be re-keyed to `'bullmq-redis' | 'bullmq-postgres' | 'temporal'`. One name covering two datastores is how a table that exists to record differences ends up hiding one.

**Applies to**: `packages/jobs-bullmq`, `apps/worker/test/jobs-integration/harness.ts`, and the `bullmq-postgres` leg of `.github/workflows/jobs-parity.yml`. Redis stays the default, and this — not throughput — is the reason.

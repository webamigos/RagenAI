---
title: 'BullMQ matches Temporal at 20 concurrent ingests — but only once `WORKER_CONCURRENCY` matches; at the shipped default it is 2x slower'
modules: ['worker']
areas: ['architecture']
topics:
  [
    'bullmq',
    'temporal',
    'worker-runtime',
    'load-test',
    'concurrency',
    'adr-44',
    'measurement',
  ]
---

# BullMQ matches Temporal at 20 concurrent ingests — but only once `WORKER_CONCURRENCY` matches; at the shipped default it is 2x slower

> **Acted on.** `DEFAULT_CONCURRENCY` was raised from 10 to 20 the same day, so
> "the shipped default" in the title describes what was measured, not what
> ships now. The numbers below are unchanged and are what that change rests on.

**Context**: D2 of
[the worker-runtime spec](../specs/2026-09-15-bullmq-is-the-worker-runtime.md) —
the measurement Phase E's decision rests on, and the one
[the 2026-09-05 run](worker-concurrency-load-test-2026-09-05.md) asked someone
to do properly: multiple concurrency levels including a single-file baseline,
repetitions per level, and a timing split that can attribute a difference to
something.

**Method**: `apps/worker/src/scripts/jobs-load-test.ts`, 2026-09-16, one
machine, one afternoon, both runtimes against the same live stack — real
Scaleway embeddings, real Vertex summary and RAG-score calls, real Qdrant, real
Presidio, `STORAGE_PROVIDER=s3`. A throwaway project per run, ~500-word
plain-text documents, everything deleted after each repetition so a later run
never writes into a bigger collection. **416 ingests, zero failures.**

**Result**, pooled per file rather than averaged over runs (160 files per cell
at level 20):

| config | level | files | min | p50 | p95 | max | queue wait p50 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| temporal | 1 | 3 | 8.5s | 10.0s | — | 13.3s | 0.61s |
| temporal | 5 | 15 | 6.1s | 8.9s | 12.5s | 12.5s | 0.52s |
| **temporal** | **20** | **160** | 8.2s | **12.5s** | 22.1s | 25.0s | 1.41s |
| bullmq, default concurrency (10) | 1 | 3 | 5.3s | 6.9s | — | 7.1s | 0.14s |
| bullmq, default concurrency (10) | 5 | 15 | 5.7s | 11.0s | 20.2s | 20.2s | 0.22s |
| **bullmq, default concurrency (10)** | **20** | **60** | 6.4s | **24.9s** | 40.9s | 40.9s | **18.5s** |
| **bullmq, `WORKER_CONCURRENCY=20`** | **20** | **160** | 7.7s | **12.3s** | 29.6s | 35.9s | 0.69s |

**Three readings, in the order they matter.**

1. **At the shipped default, BullMQ is about twice as slow at 20 concurrent
   ingests** — 24.9s against 12.5s at the median, with no overlap between the
   runs (BullMQ 23.9/25.3/28.1, Temporal 11.1–18.7 over eight). A customer's
   first document import is exactly this shape, so this is the number that
   would have been read as "the port made ingest slower".
2. **It is not the engine, and one setting removed it.** Two separate findings,
   worth keeping separate. *Not the engine*: the entire difference sits before
   the work starts — median time from enqueue to the first status write is
   18.5s on BullMQ-at-10 against 1.41s on Temporal, while the parse and embed
   medians are the same on both. *One setting*: change `WORKER_CONCURRENCY` to
   20, alter nothing else, and the median becomes **12.3s against Temporal's
   12.5s**, with the pre-parse window now *shorter* than Temporal's (0.69s
   against 1.41s).

   The mechanism is almost certainly the slot wait — `DEFAULT_CONCURRENCY` is
   10 whole jobs per queue, while Temporal's
   `maxConcurrentActivityTaskExecutions: 50` counted *activities*, about twenty
   per ingest, so twenty files ran at once there and ten here. But the window
   that grew also contains the file's download and type detection, and the
   c20 runs happened later in the afternoon than the c10 ones, so this is the
   best available explanation rather than something the instrument isolated.
   One of the eight c20 repetitions behaved exactly like a c10 one.
3. **The tail is wider on BullMQ and this measurement cannot say why.** p95
   29.6s against 22.1s at matched concurrency, and the per-run medians spread
   further (9.2–24.0s over eight runs, against 11.1–18.7s). Both have n=8
   against providers whose latency moved all afternoon. It is an observation,
   not a finding — the same trap the 2026-09-05 run fell into, from the other
   side.

**One caveat about the instrument, stated because the number is quoted above.**
`queueWaitMs` is enqueue → `parsing_started_at`, and the pipeline downloads the
file from S3 and detects its type *before* that write. So it is "time before
parsing starts", not pure engine latency, and on a slow S3 moment it absorbs
that too. It is still the right column to read for this question, because the
alternative — parse and embed — is identical on both runtimes.

**Rule**: **parity is a configuration claim, not an engine claim.** Both halves
were done on the strength of this: `DEFAULT_CONCURRENCY` became 20, and the
installer writes the variable explicitly so an operator can find the knob. A
deployment that had taken the old default would have got the 2x and read it as
the runtime's fault, because the runtime is what changed. Conversely, do not read this as "BullMQ is
slower": at one file it is *faster* (6.9s against 10.0s), which is the engine's
own overhead showing up where nothing queues.

**Applies to**: `packages/jobs-bullmq/src/worker.ts`'s `DEFAULT_CONCURRENCY`,
`apps/worker/src/bullmq-runtime.ts`'s `resolveConcurrency`, and the Phase E
decision in the worker-runtime spec. Re-run with
`apps/worker/src/scripts/jobs-load-test.ts` and
[the runbook](../runbooks/worker-runtime-load-test.md); this run's per-repetition
tables are in the pull request that added this file.

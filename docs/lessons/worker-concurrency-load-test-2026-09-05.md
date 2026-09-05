---
title: 'Tail latency at 20 concurrent ingests varies run to run (1.25x-2x median) — measure more than once before trusting a single number'
modules: ['worker']
areas: ['architecture']
topics: ['temporal', 'litellm', 'qdrant', 's3', 'load-test', 'concurrency', 'onboarding']
---

# Tail latency at 20 concurrent ingests varies run to run (1.25x-2x median) — measure more than once before trusting a single number

**Context**: a code review of `apps/worker` flagged `maxConcurrentActivityTaskExecutions: 50`
(`apps/worker/src/worker.ts`) with no rate limiting in front of the shared LiteLLM proxy or
Qdrant, and recommended measuring before adding a limiter speculatively. This is that
measurement — run twice, a day apart, once the second run's actual goal (a working S3
credential) became available.

**Method**: a throwaway organization + project (deleted after each run, along with its
Qdrant collection and `ai_usage` rows), 20 synthetic ~500-word `.txt` files uploaded and
started as 20 concurrent `runFileEmbeddings` workflows against the real stack — real
LiteLLM proxy, real embedding/summary/RAG-score model calls, real Qdrant, real Presidio
(PII masking is on by default).

**Result**: two runs, same script, same file count, different storage backend and (a day
apart) different real-world load on the shared external providers behind LiteLLM:

| | Run 1 — `STORAGE_PROVIDER=local` | Run 2 — `STORAGE_PROVIDER=s3` (real Scaleway) |
|---|---|---|
| Workflow-start time (20 starts) | 337ms | 2127ms |
| min | 22.1s | 15.9s |
| p50 | 25.5s | 22.0s |
| p95 / max | 49.0s | 27.5s |
| Total wall time | 49.1s | 29.2s |
| Failures | 0 / 20 | 0 / 20 |

Both runs: zero failures, workflow-start itself is never the bottleneck (the real work is
inside the activities). Where they disagree is the tail: run 1's slowest workflow took
~2x the median, run 2's took ~1.25x. The storage backend is not the explanation — files
are a few KB either way, and S3 round-trips if anything should make run 2 slower, not
faster with a tighter tail. The more likely cause is ordinary variance in the shared
external providers behind LiteLLM (embeddings, summary, RAG-score, Presidio) — this
environment's genuinely real network calls, at whatever load they happened to be under at
each run's time of day. This run did not isolate *which* service the variance comes
from; that needs per-service timing spans inside the activities, which none of them
currently emit.

**Rule**: don't read `maxConcurrentActivityTaskExecutions: 50` as "the system handles 50
concurrent ingests fine," and don't read a single load-test run as a stable baseline
either — this measurement shows both real degradation *and* real run-to-run variance,
both well below the configured cap. Before raising ingest volume (a larger onboarding
batch, a bulk re-embed/folder action), re-run this test more than once at the volume you
actually expect rather than trusting one number, and add per-activity timing spans so a
future run can attribute tail latency to a specific service instead of guessing. Only add
a semaphore/rate limiter in front of LiteLLM once a real deployment's volume is known to
cross the point where this starts mattering — building one now would be guessing at a
number this measurement did not produce.

**Applies to**: `apps/worker/src/worker.ts`'s `maxConcurrentActivityTaskExecutions`, and
any code path that starts many `runFileEmbeddings`/`scrapeWebsite` workflows at once —
`reembedFolderWithPolicyCommand`, Google Drive folder import, and a customer's initial
document upload wave hit exactly this pattern. Run 1 used `STORAGE_PROVIDER=local`
specifically to route around a dead S3 key discovered along the way — see
[the S3 signature-mismatch lesson](s3-signature-mismatch-across-every-endpoint-is-the-key-not-config.md)
for that diagnosis.

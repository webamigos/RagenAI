---
title: 'Tail latency roughly doubles at 20 concurrent ingests, well below the configured 50-activity concurrency cap'
modules: ['worker']
areas: ['architecture']
topics: ['temporal', 'litellm', 'qdrant', 'load-test', 'concurrency', 'onboarding']
---

# Tail latency roughly doubles at 20 concurrent ingests, well below the configured 50-activity concurrency cap

**Context**: a code review of `apps/worker` flagged `maxConcurrentActivityTaskExecutions: 50`
(`apps/worker/src/worker.ts`) with no rate limiting in front of the shared LiteLLM proxy or
Qdrant, and recommended measuring before adding a limiter speculatively. This is that
measurement.

**Method**: a throwaway organization + project (deleted after the run, along with its
Qdrant collection), 20 synthetic ~500-word `.txt` files uploaded to local storage and
started as 20 concurrent `runFileEmbeddings` workflows against the real local stack —
real LiteLLM proxy, real embedding/summary/RAG-score model calls, real Qdrant, real
Presidio (PII masking is on by default). `STORAGE_PROVIDER` was switched to `local` for
the run only, sidestepping an unrelated S3 credential issue in the dev environment — see
below.

**Result**: all 20 workflows started within 337ms (workflow-start itself is not the
bottleneck). Per-workflow completion latency:

| | value |
|---|---|
| min | 22.1s |
| p50 | 25.5s |
| p95 | 49.0s |
| max | 49.0s |
| Total wall time (all 20 done) | 49.1s |
| Failures | 0 / 20 |

Nothing failed, but the slowest run took roughly **2x** the median — at only 20
concurrent uploads, well under the 50-activity ceiling. That gap is the actual signal:
contention shows up before the configured cap is anywhere near reached. This run did not
isolate *which* shared service is the bottleneck (LiteLLM, the embedding provider behind
it, or Presidio are the candidates — Qdrant upserts are local and fast); that would need
per-service timing inside the activities, which none of them currently emit.

**Rule**: don't read `maxConcurrentActivityTaskExecutions: 50` as "the system handles 50
concurrent ingests fine" — this measurement shows real degradation starting well below
that number. Before raising ingest volume (a larger onboarding batch, a bulk
re-embed/folder action), either re-run this test at the volume you actually expect, or
add per-activity timing spans so a future run can attribute the tail latency to a
specific service instead of guessing. Only add a semaphore/rate limiter in front of
LiteLLM once a real deployment's volume is known to cross the point where this starts
mattering — building one now would be guessing at a number this measurement did not
produce.

**Applies to**: `apps/worker/src/worker.ts`'s `maxConcurrentActivityTaskExecutions`, and
any code path that starts many `runFileEmbeddings`/`scrapeWebsite` workflows at once —
`reembedFolderWithPolicyCommand`, Google Drive folder import, and a customer's initial
document upload wave hit exactly this pattern.

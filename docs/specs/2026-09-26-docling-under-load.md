---
title: Document ingest that survives a slow, busy or absent Docling
status: draft
areas: [worker, knowledge-base, self-hosting]
adrs: [44, 47, 43]
---

# Document ingest that survives a slow, busy or absent Docling

## TLDR

A self-hosted install that parses with Docling only (`DOCLING_STRICT=1`) can
lose a whole upload today: a burst of files sends up to 20 conversions per
worker replica at one Docling, and a Docling that is busy or down fails each
file permanently after about six seconds of retries. This spec puts a
deployment-wide ceiling on conversions, treats "Docling is busy or away" as a
reason to wait rather than to fail, and makes an outage visible. The
non-obvious part is that the defences exist already — a global ceiling
mechanism, a health check, retry policies — and none of them is wired to
Docling.

## Open Questions

<!--
Answer these on the PR. While this block is here the spec is not ready to
implement and no code should be written from it.
-->

- **Q1. What does the ceiling cap — the whole ingest job, or only the Docling
  call?** Capping `runFileEmbeddings` reuses the mechanism `brainExtract`
  already has (`jobConcurrency` → `queue.setGlobalConcurrency`) and is one
  line of wiring; it also slows embedding for the few types Docling never sees
  (SRT, EPUB, URL). Capping only the call needs a Redis semaphore around
  `convertWithDocling`. *Recommendation: the whole job* — `DOCLING_SUPPORTED_TYPES`
  covers PDF, DOCX, PPTX, XLSX, CSV, images, Markdown and text, so in practice
  the two are the same queue, and the semaphore is a second concurrency system
  to keep correct.
- **Q2. Default ceiling.** docling-serve runs `DOCLING_SERVE_ENG_LOC_NUM_WORKERS=2`
  conversions at a time and queues the rest in memory. *Recommendation: 4* —
  two converting, two waiting inside Docling's own queue so it never idles
  between jobs — with the variable documented next to Docling's.
- **Q3. A file waiting for Docling: a new status, or the existing one with a
  reason?** `ParsingStatus` today is `NOT_STARTED | STARTED | COMPLETED |
  FAILED | CANCELLED`. A new value (`WAITING_FOR_PARSER`) is honest in the list
  and filterable, and costs a migration plus every place that switches on the
  enum. Keeping `NOT_STARTED` and writing the reason into `UserFile.metadata`
  (JSON, already there) is free and shows "In queue" — which is true.
  *Recommendation: keep `NOT_STARTED`, reason in `metadata`, shown as the row's
  tooltip*; revisit if support asks.
- **Q4. Stay on the sync endpoint, or move to `/v1/convert/source/async` +
  polling?** Async removes the 504-at-`MAX_SYNC_WAIT` race entirely and lets a
  400-page PDF take as long as it takes; it is also the larger change and a
  second code path to test against every Docling upgrade.
  *Recommendation: not in this spec* — Phase A makes the sync path's timeouts
  agree, and async becomes a follow-up only if long documents still time out.
- **Q5. Where does a Docling outage show?** Options: the apps/web setup page
  (already reports Redis), the per-org admin area, the platform admin
  (`apps/admin`), a log line only. *Recommendation: setup page + a warning in
  the knowledge base upload area while it is down*, plus one `error` log per
  transition, not per file.

## Problem

**Evidence — the demo, 2026-09-14 → 2026-09-26.** Docling on Railway had no
successful deployment for twelve days: #1167 deleted `infra/docling/railway.toml`
and the dashboard's Dockerfile path read `infra/Docling`, which a
case-sensitive filesystem does not have (ADR-47 moved this configuration to the
dashboard). Nothing noticed. Every file processed meanwhile fell through to the
legacy loaders. Confirmed from the worker's logs on 2026-09-26: all eight
spreadsheets, re-processed that morning, logged `Docling parsing failed … fetch
failed` and were indexed as SheetJS CSV — and one, indexed before #1347, as raw
OOXML XML that was then quoted under answers. The corpus's other 19 documents
were uploaded on 2026-09-19, inside the outage, and so were parsed by the legacy
path — which for a PDF sends the document to an external model; the logs of
that deployment are gone, so this is inferred from the dates, not read. Re-indexing all 27 through a repaired Docling
took four batches and about four minutes with no failure — so the capacity was
never the problem; the absence was, and nothing said so.

**What the same outage does with `DOCLING_STRICT=1`** — the setting a
self-hoster is told to use when documents must not leave the machine
(`.env.example`, Helm `values.yaml`), traced in code:

1. **No ceiling.** `runFileEmbeddings` runs at `WORKER_CONCURRENCY`, default 20
   (`packages/jobs-bullmq/src/worker.ts:90`), per replica — two replicas run 40.
   Each job calls Docling's sync endpoint as soon as it starts. The global
   ceiling mechanism exists (`worker.ts:325-327`) and is wired only for
   `brainExtract` (`apps/worker/src/bullmq-runtime.ts:99`).
2. **A busy Docling fails the file for good.** `loadDocling` retries three
   times in-process with 2 s and 4 s backoff (`parse-and-embed.ts:113-121`).
   Then the handler throws, the row is written `FAILED` (`:494-498`), and the
   BullMQ job has one attempt — `start()` enqueues with no `attempts` or
   `backoff` (`packages/jobs-bullmq/src/index.ts:156-163`). A queue that takes
   minutes to drain outlives six seconds of retries every time. Recovery is a
   person selecting the files and choosing *Re-process*.
3. **Retries add load.** `withTimeout` is a bare `Promise.race`
   (`packages/jobs-bullmq/src/context.ts:55-78`) and the fetch has no signal
   (`apps/worker/src/services/docling-client.ts:585`), so an abandoned attempt's
   conversion keeps running inside Docling while the retry queues another.
4. **The timeouts disagree.** The step allows 10 minutes; undici's implicit
   `headersTimeout` is 300 s; docling-serve answers **504** at
   `DOCLING_SERVE_MAX_SYNC_WAIT` — 300 s in compose and the Railway image, and
   the upstream default of **120 s** under Helm, which does not set it. The
   conversion is not cancelled by that 504.
5. **An outage is invisible.** `isDoclingAvailable()` (`docling-client.ts:710`)
   has no caller. An unreachable Docling surfaces as `TypeError: fetch failed`
   per file, at `warn`, and — without strict mode — as a silent fallback.
6. **A comment says the opposite of the code.** `parse-and-embed.ts:499-502`
   says the strict-mode failure "already has the right retry flag"; it is
   `retryable: true` and its message is replaced by a generic wrapper at
   `:509-511`, so the reason the user needs is lost.

There is also no sizing guidance: `create-ragen-app` writes
`WORKER_CONCURRENCY=20` with the model provider's rate limit as the only
rationale (`packages/create-ragen-app/src/worker-runtime.ts:81-91`), measured
with small `.txt` files.

## Out of scope

- **Docling's own scaling** — replicas behind a load balancer, the `rq`/`ray`
  engines, GPU images. The ceiling makes one Docling safe; more of them is a
  deployment decision documented, not built, here.
- **The async endpoint** (Q4), unless the answer is "yes".
- **The non-strict fallback.** Whether falling back to a loader that sends a PDF
  off-site should be the default is a real question and a separate one; this
  spec only makes the fallback visible when it happens (C1).
- **Upload-side limits** (file count per request, per-org quotas). The ceiling
  is on work, not on intake: an upload of 500 files is fine if they wait.
- **"Oceń dla RAG" scores** moving after re-indexing — being specified
  separately.

## Proposed solution

Three layers, each useful alone.

**1. A deployment-wide ceiling on conversions** (`DOCLING_MAX_CONCURRENCY`,
default per Q2) set through the existing `jobConcurrency` wiring, so it holds
across replicas via BullMQ's global concurrency in Redis. Rejected: lowering
`WORKER_CONCURRENCY` — it caps every queue per replica, so it both slows
unrelated jobs and still multiplies with replicas. Rejected: a rate limiter
(`limiter`) — Docling's cost is per conversion in flight, not per minute.

**2. "Busy or away" is a wait, not a failure.** The Docling client classifies
what it gets back:

| Outcome | Examples | Treatment |
| --- | --- | --- |
| transient | `ECONNREFUSED`, `UND_ERR_*`, DNS failure, HTTP 502/503/504, 429 | retryable at the **job** level with long exponential backoff (e.g. 1 → 2 → 4 → 8 → 16 min, 6 attempts); the row stays `NOT_STARTED` with the reason in `metadata` (Q3) |
| permanent | docling `status: failure`, HTTP 4xx other than 429, empty markdown | non-retryable; `FAILED` with Docling's own message, not the generic wrapper |

The fetch gets an `AbortSignal` wired to the step's timeout, so an abandoned
attempt is cancelled on our side, and the timeout is derived from one value:
`DOCLING_SERVE_MAX_SYNC_WAIT` plus a margin, set explicitly in compose, the
Railway image **and Helm**. Before sending, the job checks `/health` (cached
for a few seconds across the process); if Docling is down it re-schedules
itself without spending an attempt. Rejected: in-process retries with a longer
backoff — they hold a worker slot and a lock while sleeping, and a restart
loses them.

**3. An outage is seen.** Docling's health joins the apps/web setup/status
reporting (Q5); one `error` log on the transition to down and one `info` on
recovery; the knowledge base shows "Parser unavailable — files will be
processed when it returns" while down. A non-strict fallback logs at `error`
with the file type, because for a PDF it means the document left the machine.

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `packages/jobs-bullmq` | job-level `attempts`/`backoff` for `runFileEmbeddings`; delay-without-attempt on "parser down" | `npm run worker:test:jobs` (real Redis) — the BullMQ gate |
| `packages/env` | `DOCLING_MAX_CONCURRENCY`, and `DOCLING_SERVE_MAX_SYNC_WAIT` read by the worker | fragment tests + `provider-fragments-carry-their-rules` |
| `apps/worker` | client error classification, abortable fetch, health gate, message kept | unit tests + `workflow.spec` |
| `apps/web` setup page, knowledge base | Docling status (Q5) | component tests; `smoke-*` if the upload area changes |
| `packages/create-ragen-app` | writes the ceiling and the sync wait; sizing note | its tests + `create-ragen-app-manifest-is-current` |
| `deploy/helm`, `docker-compose.yml`, `infra/docling` | `DOCLING_SERVE_MAX_SYNC_WAIT` everywhere, one value | `check:config-paths`; a test reading all three agree |
| `prisma/schema.prisma` | none if Q3 = keep `NOT_STARTED`; an enum value otherwise | migration + `npm run verify` |

## Data model

None, if Q3 is answered "keep `NOT_STARTED`": the reason goes in
`UserFile.metadata` under one key (e.g. `waitingFor: { parser: 'docling',
since, attempts }`), cleared when parsing starts. Rows already `FAILED` by a Docling
outage are not touched automatically — they are recovered by *Re-process*, as
today; the release note says so.

## Failure modes

- **Docling down for hours.** Jobs back off to the cap and wait; after the last
  attempt the file is `FAILED` with "parser unavailable since …", and one
  *Re-process* recovers it. The health gate keeps attempts from being spent
  while it is down.
- **Docling up but saturated.** The ceiling keeps in-flight conversions at the
  limit; excess jobs wait in Redis, not in Docling's memory.
- **A 504 at `MAX_SYNC_WAIT` for a genuinely long document.** Retried — and
  would 504 again. After two consecutive 504s for the same file, the error says
  "document too long for the sync wait; raise `DOCLING_SERVE_MAX_SYNC_WAIT`",
  and Q4's async path becomes the fix.
- **Redis unavailable.** No change: the worker already refuses to run without it.
- **A misconfigured ceiling** (0, negative, text). `positiveIntFromEnv`
  rejects it at boot, as `BRAIN_EXTRACT_CONCURRENCY` does.
- **Health endpoint up, conversion broken.** The health gate passes, the
  conversion fails permanently with Docling's message — the right outcome.
- **Two replicas start with different ceilings.** The last
  `setGlobalConcurrency` wins; documented as "set it in one place".

## Phases

Each phase leaves the application working.

### Phase A — stop losing files

- [ ] **A1.** `DOCLING_MAX_CONCURRENCY` in `@ragenai/env`, wired as
  `jobConcurrency: { runFileEmbeddings: … }`. Integration test on real Redis:
  with the ceiling at 2 and two worker instances, never more than 2 jobs run.
- [ ] **A2.** Docling client: `AbortSignal` from the step timeout; timeout
  derived from `DOCLING_SERVE_MAX_SYNC_WAIT` + margin; the same value set
  explicitly in compose, `infra/docling/Dockerfile` and Helm, with a test that
  the three agree.
- [ ] **A3.** Error classification (table above); transient → job-level
  retry with backoff, permanent → non-retryable with Docling's message; the
  comment at `parse-and-embed.ts:499` corrected. Unit tests per class; a
  workflow test that a 503 then a success indexes the file.

### Phase B — wait out an outage

- [ ] **B1.** Health gate before sending (cached), delaying the job without
  spending an attempt; `isDoclingAvailable` gets its first caller and tests.
- [ ] **B2.** The waiting reason on the row and in the knowledge base list
  (per Q3).

### Phase C — see it, size it

- [ ] **C1.** Docling status on the setup page (per Q5); transition logs;
  the non-strict PDF fallback logged at `error`.
- [ ] **C2.** Sizing section in `docs/document-processing.md` and the Docling
  runbook: CPU/RAM per concurrent conversion, `ENG_LOC_NUM_WORKERS`, how the
  ceiling relates to it; `create-ragen-app` writes the ceiling and says why.
- [ ] **C3.** Measure: the jobs load test run with PDFs through a real Docling
  (the demo corpus, `e15d46c10:scripts/demo-corpus/files`) at ceilings 2/4/8,
  recording throughput and failures — the number the default rests on.

## Testing

- Unit: error classification, timeout derivation, health cache.
- Integration (`npm run worker:test:jobs`, real Redis): the ceiling across two
  worker instances; transient-then-success; down-then-up without spending
  attempts.
- A config-agreement architecture test for `DOCLING_SERVE_MAX_SYNC_WAIT`.
- Fault injection by hand, recorded in the PR: stop the Docling container
  mid-upload of 20 PDFs with `DOCLING_STRICT=1`; every file must end indexed
  after it returns, none `FAILED`.

## Rollout and rollback

Each phase is its own PR onto `main` (ADR-50). A1's ceiling applies on the
next worker boot; setting `DOCLING_MAX_CONCURRENCY` high restores today's
behaviour without a revert. A3/B1 change failure handling only — reverting the
PR restores the old behaviour, no migration (if Q3 = keep `NOT_STARTED`).
`create-ragen-app` changes ship with a release note, since they change what a
fresh install writes.

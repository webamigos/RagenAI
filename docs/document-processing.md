# Document Processing

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget. Reached from that file's Task Router.

Upload → S3 → the ingest job in `apps/worker` → parse → embed → store in Qdrant. Status via `ParsingStatus`/`EmbeddingStatus` enums.

**File types** (`FileType` enum: `PDF`, `EPUB`, `DOCX`, `SRT`, `TEXT`, `MARKDOWN`, `URL`, `IMAGE`, `CSV`, `XLSX`):
- **PDF**: worker uses Claude native PDF (base64 to Claude in single call). `PDF_PROCESSOR=claude|vision`, `PDF_MODEL`. **`PDF_MODEL` must name a route in `infra/llm-gateway/routes.yaml`** — a model with no route resolves to nothing and every PDF fails. `claude-haiku-4-5`, the default, has one. Chat: attached as binary data URL.
- **DOCX**: `mammoth` (client-side in chat, worker-side for KB).
- **Image** (jpg/png/webp/gif): chat uses multimodal vision LLMs w/ lightbox; KB describes via vision LLM then embeds.
- **XLSX/XLS**: SheetJS → CSV (client for chat, worker for KB).
- **CSV/TXT/Markdown**: read as plain text (5MB CSV limit in chat).
- **SRT**: worker uses LLM to chunk into meaningful segments.
- **EPUB**: binary upload, worker text extraction.

## Sizing Docling

Docling (`DOCUMENT_PARSER=docling`, the default) parses every type above except
SRT, EPUB and URLs, so its capacity is the capacity of ingest. Three numbers
decide it, and they have to be set together
(spec [2026-09-26-docling-under-load](specs/2026-09-26-docling-under-load.md)):

| Variable | Set on | Default | What it is |
| --- | --- | --- | --- |
| `DOCLING_SERVE_ENG_LOC_NUM_WORKERS` | the Docling service | `2` (upstream; nothing here sets it) | conversions docling-serve runs at once; the rest wait in its own queue |
| `DOCLING_NUM_THREADS` (`OMP_NUM_THREADS`) | the Docling service | `4` (compose, `infra/docling/Dockerfile`) | CPU threads one conversion uses |
| `DOCLING_MAX_CONCURRENCY` | apps/worker, BullMQ runtime only | `4` (worker, Helm, `create-ragen-app`) | ingests the whole deployment runs at once, across every worker replica — so conversions Docling is sent at once. Temporal counts activities, not jobs, and does not read it |

**Measured, 2026-09-28**, on docling-serve-cpu `v1.32.0` in a Docker VM with 5
CPUs and 8 GiB, with the options the worker sends (OCR on, `table_mode:
accurate`), on 2–4-page PDFs from the demo corpus:

| In flight | Wall time | Peak CPU | Peak memory |
| --- | --- | --- | --- |
| idle | — | — | 1.4–1.7 GiB |
| 1 | 10–35 s | ~4.8 cores | 2.3–2.4 GiB |
| 2 | 22–66 s for both | all 5 | 2.7–3.0 GiB |
| 4 | two in 39 s, all four in 102 s | all 5 | 3.2 GiB |

Wall time moved threefold between runs with the host's other load; the
ratio did not — two at once always took about twice as long as one. The
first conversion on each Docling worker was three to four times slower
(46 s) — models load on first use per worker even with
`DOCLING_SERVE_LOAD_MODELS_AT_BOOT`. These are small documents; a long scan
takes more of both. C3 of the spec measures the ceiling itself, at 2/4/8 on
the demo corpus through the whole ingest.

What follows from it:

- **One conversion uses about `DOCLING_NUM_THREADS` cores.** Two run side by
  side only on roughly `ENG_LOC_NUM_WORKERS × DOCLING_NUM_THREADS` cores — 8 at
  the defaults. On fewer, the second one halves the speed of the first and
  throughput stays where it was: above, two at once took twice as long as
  one, in every run. Raising `ENG_LOC_NUM_WORKERS` without the cores adds nothing.
- **Memory: plan 4 GiB for the defaults**, and budget 1 GiB more per extra
  `ENG_LOC_NUM_WORKERS` — each worker loads its own copy of the models
  (`DOCLING_SERVE_ENG_LOC_SHARE_MODELS` is off upstream). Measured, a
  converting document added about 0.5 GiB; the rest is headroom for longer
  ones, not a number anyone has taken.
- **On BullMQ, keep `DOCLING_MAX_CONCURRENCY` at about twice `ENG_LOC_NUM_WORKERS`**
  (times the number of Docling replicas, if you run several behind a load
  balancer). Two per worker keeps Docling busy between documents. More than
  that only moves the queue from Redis, where the worker can see it, into
  Docling's memory, where a request spends its
  `DOCLING_SERVE_MAX_SYNC_WAIT` waiting and can come back 504 without ever
  having started.
- **`WORKER_CONCURRENCY` does not raise it.** It caps every queue per replica;
  the Docling ceiling holds across all of them, so twenty worker slots still
  mean four conversions.

To add capacity, give Docling cores first, then raise
`DOCLING_SERVE_ENG_LOC_NUM_WORKERS` and (on BullMQ) `DOCLING_MAX_CONCURRENCY`
in the same change. To measure a machine of your own, see "Capacity" in
[`runbooks/docling-upgrade.md`](runbooks/docling-upgrade.md).

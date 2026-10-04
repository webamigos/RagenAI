# B1 — off, off with cross-query fusion, and Scaleway

Phase B1 of
[the retrieval-claims spec](../../../../../docs/specs/2026-10-03-retrieval-claims-match-the-product-before-launch.md),
run on 2026-10-03 against `bb92a0fd1` (`fix/multi-query-cross-query-fusion`,
B0: the `crossQueryFusion` feature key). The question is Q2: does the
`tabele` gain the A3 baseline credited to "reranking" come from the
reranker's order, or from the multi-query variant finally reaching the model?

## What was run

- **Arms**, on today's default install (`contextualChunks` and
  `contextExpansion` on, `sectionSelection` off):
  - `off` — `FEATURE_FLAG_RERANKING=0` on the server, the organization's
    `rerankingEnabled` false, `crossQueryFusion` false;
  - `off-fusion` — the same, with `crossQueryFusion` true;
  - `scaleway` — `FEATURE_FLAG_RERANKING=1`, `rerankingEnabled` true,
    `crossQueryFusion` false (`qwen3-embedding-8b`).
  Cohere was not run: no endpoint on this machine.
- **How the arms were set:** the organization's `reranking_enabled` column and
  `feature_overrides` JSON set in SQL, the server env changed and apps/web
  restarted between arms.
- **Trace confirmation:** every case of every run reports the step the server
  ran — `fusion` × 24 / × 18 on every `off` and `off-fusion` run,
  `reranker:scaleway` × 24 / × 18 on every Scaleway run — and
  `crossQueryFusionEnabled` true on every `off-fusion` case and false on every
  other. No run was excluded for a mismatch.
- **Corpora:** `kolej-bilingual-v1` rev 2 (24 questions) and
  `tabele-bilingual-v1` **rev 2** (18 questions; A3 ran rev 1, before the
  rubric fix in #1459).
- **Repetitions:** three per arm and corpus, 18 runs. The control arm ran
  once per corpus and scored 0/24 and 0/18.
- **Stack:** chat `gemini-3-flash-preview`, judge `gemini-2.5-flash`, rephrase
  `mistral-small-3.2`, embeddings `bge-multilingual-gemma2`, one multi-query
  variant. Docling was not running, so the Markdown went through the legacy
  loader, as the README's prerequisites describe. Every arm ingested the same
  way.
- **Setup:** a private database (`ragen_e2e_b1`), Redis db 7, local storage,
  apps/web as a production build on port 3400, and a project and thread cloned
  from the seeded ones (`RAG_EVAL_PROJECT_ID`/`RAG_EVAL_THREAD_ID`). The
  seeded project's Qdrant collection held leftover chunks of
  `en-01-refund-policy.md` from another database, which the seeded project id
  would have retrieved.
- **The trace had to be extended to confirm the arm.** B0 adds
  `crossQueryFusionEnabled` to the chain's `RetrievalTrace`, but
  `toRetrievalEventTrace` did not forward it to the SSE event, and the harness
  did not record it. Both were changed to pass it through; the change ships
  with B0 (#1518).

## Results

Pass rate is the RAG arm. Evidence recall counts how many of the figures the
assertions look for appeared in the chunks the server says it rendered.

| corpus | arm | pass, runs 1/2/3 | evidence recall, runs 1/2/3 | cross-lingual evidence |
|---|---|---|---|---|
| kolej | off | 22/24, 22/24, 24/24 | 25, 25, 26 /26 | 7, 7, 8 /8 |
| kolej | off-fusion | 24/24, 23/24, 24/24 | 26, 25, 26 /26 | 8, 7, 8 /8 |
| kolej | Scaleway | 21/24, 23/24, 20/23¹ | 26, 26, 26 /26 | 8, 8, 8 /8 |
| tabele | off | 14/17¹, 15/18, 14/18 | 15, 15, 14 /18 | 5, 5, 4 /5 |
| tabele | off-fusion | 15/18, 12/17¹, 16/18 | 15, 14, 16 /18 | 5, 5, 5 /5 |
| tabele | Scaleway | 17/18, 16/17¹, 16/18 | 17, 17, 16 /18 | 5, 5, 5 /5 |

¹ One case ungraded (the judge returned unreadable JSON on an answer whose
assertions passed). It is excluded from the denominator, as the harness does.
On `tabele` this was `en-heat-charge-mass` all three times.

Medians:

`pass` is the median **number of passed cases** across the three runs, shown
over the corpus size. It is not a median pass rate: a run with an ungraded
case has a denominator one smaller (17 on `tabele`), and the rate medians are
then 14/17 for `off`, 15/18 for `off-fusion` and 16/17 for Scaleway. The
comparison reads the same either way.

| corpus | arm | pass | evidence | cross-lingual evidence |
|---|---|---|---|---|
| kolej | off | 22/24 | 25/26 | 7/8 |
| kolej | off-fusion | 24/24 | 26/26 | 8/8 |
| kolej | Scaleway | 21/24 | 26/26 | 8/8 |
| tabele | off | 14/18 | 15/18 | 5/5 |
| tabele | off-fusion | 15/18 | 15/18 | 5/5 |
| tabele | Scaleway | 16/18 | 17/18 | 5/5 |

## What it says

**The gain A3 measured is mostly gone, because the off arm caught up.** A3's
`tabele` off arm scored 7/18 with 8/18 evidence. Today's default install
scores 14/18 with 15/18. The install now has contextual chunks and context
expansion, and the rubric is rev 2. The six-figure evidence gap A3 credited to
the reranker is now two figures. There is little left for either candidate
explanation to recover.

**Off-fusion does not recover what is left on `tabele`.** Its median evidence
equals off's (15/18), and its pass median is one case higher, within noise.
The questions Scaleway still wins on are the same under fusion as under off.
The clearest is `en-guard-false-premise`: Scaleway had its evidence in all
three runs, and off and off-fusion in none. That points at the reranker's
order rather than at the variant's hits, but does not prove it: the fusion
arm fused four candidates per query and Scaleway chose from six, lists that
share hits can move the fused cut, and the traces do not record the
per-query candidate lists that would settle it.

**Scaleway's remaining `tabele` margin is under the noise floor.** It is
+2 evidence and +2 passes on the median. Every Scaleway run had at least 16
figures of evidence, and no off run had more than 15. That is consistent, but
it is still below the README's three-case threshold for a single delta.

**On `kolej` nothing changes beyond noise.** Every arm is at or near the
ceiling: 25–26/26 evidence. Fusion adds one figure of cross-lingual evidence
(`xl-en2pl-bike-fare`, in two of three runs) and two passes on the median, both
within noise. Scaleway's lower pass median (21/24) comes with full evidence in
every run, so its misses happened in the answer, not in retrieval.

**For Q2 this reads as "neither beats off beyond the spread".** Cross-query
fusion is not shown to help or hurt, and Scaleway's edge on tables is real in
direction but too small to quote. Three runs cannot separate a two-case
difference from noise. More repetitions, or a corpus further from the ceiling,
would be needed to quote it.

**The duplicate-counting fix after these runs (b0b63b056).** The off-fusion
runs used `fuseAcrossQueries` before that fix, which credited a chunk once per
occurrence within one query's list. On `kolej` no two chunks can share text,
since no line repeats across its documents, so the fix does not affect those
runs. On `tabele` two pairs of chunks have identical text. Each pair is a
title-only chunk (`# Zakłady Metalurgiczne „Czarny Dunajec" sp. z o.o.` in
`pl-01`/`pl-02`, and `# Thornbury Foundry Works Ltd` in `en-01`/`en-02`).
Before the fix, a query that returned both chunks of a pair would have boosted
that title chunk, which holds no evidence. The harness does not record
per-query lists, so whether this happened, and on which cases, cannot be read
back from these results.

## Known grader false negatives

A review of the saved answers found cases graded as failures that are
correct. They are left as the harness wrote them — a results file records a
run, it is not edited after the fact — and listed here so nobody reads them
as retrieval misses:

- **`kolej` dog-fee questions (off, and the Scaleway runs):** answers that
  name the bicycle and baggage tariffs as *other* fees trip `expectNone`,
  which forbids those figures anywhere in the answer, though the rubric
  passes them.
- **`kolej` refund deadline (Scaleway run 1):** an answer that contrasts the
  21-day compensation deadline with the 14-day refund deadline trips
  `expectNone` the same way.
- **`kolej` baggage limit (Scaleway run 3):** the judge failed "18 kg per
  item, plus 6 kg hand baggage", which other runs passed.
- **`kolej` Wolfsbane refund (Scaleway run 3):** failed for not naming the
  English document as the source, though it cites it; other runs passed the
  same answer.
- **`kolej` bicycle fare (Scaleway run 1):** `9.80 PLN` for `9,80 zł`,
  accepted in other runs.

Most fall on the Scaleway arm, so its `kolej` pass median (21/24) understates
it; with full evidence in every Scaleway run, the conclusion — no arm beats
off beyond the spread — does not change. The `expectNone` cases are an
instrument defect in `kolej-bilingual-v1` (a forbidden figure should be
allowed when the answer names it as a different tariff) and need a corpus
revision, not a regrade.


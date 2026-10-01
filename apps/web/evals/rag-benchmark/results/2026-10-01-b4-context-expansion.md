# B4 — deterministic context expansion, on vs off

Phase B4 of [the selection spec](../../../../../docs/specs/2026-09-29-llm-document-selection.md),
run on 2026-10-01 against `bc8c47741` (B3: `contextExpansion`, each kept prose
hit rendered with its ±1 neighbours, within `maxDocuments × 3` chunks).

## What was compared

- **On:** `contextExpansion` on for the organization, reranking with Scaleway.
  Three runs each on `kolej-bilingual-v1` rev 2 and `tabele-bilingual-v1`
  rev 1. Every case's server trace reads `reranker:scaleway + neighbours`.
- **Off:** the [A3](./2026-10-01-a3-reranker-baseline.md) Scaleway runs from
  the same day, on the same stack and database. With the key off, B3's code
  takes the path main does: the key is read and nothing else changes. Off was
  therefore not run a second time.
- **Stack:** the same as A3. Chat `gemini-3-flash-preview`, judge
  `gemini-2.5-flash`, rephrase `mistral-small-3.2`, embeddings
  `bge-multilingual-gemma2`.

## Results

| corpus | arm | pass, runs 1/2/3 | evidence recall | cross-lingual evidence |
|---|---|---|---|---|
| kolej | off | 18/23¹, 17/24, 18/24 | 21, 20, 20 /26 | 3, 2, 2 /8 |
| kolej | **on** | 20/23¹, 19/23¹, 21/24 | 23, 23, 24 /26² | 5, 6, 6 /8 |
| tabele | off | 10/17¹, 8/18, 11/18 | 14, 13, 14 /18 | 4, 4, 4 /5 |
| tabele | **on** | 10/18, 11/18, 12/18 | 13, 15, 15 /18 | 3, 4, 5 /5 |

¹ One case ungraded (the judge returned unreadable JSON), excluded from the
denominator. ² 23/25 in run 2, where one case had no trace.

Cost, from the traces:

- **Latency:** `timings.expandMs` was 9 ms at p50 and 18 ms at p95 (one
  Qdrant scroll per file, in parallel).
- **Context:** the model reads 7 chunk positions per turn on `kolej` and 10–11
  on `tabele`, against 4 without expansion. Sections that meet are merged
  with the overlap trimmed, so the text grows by less than the count does.

## What it says

**On `kolej` it helps, and it helps where the baseline was weakest.**

- Every run with expansion passed more cases than every run without it
  (19–21 against 17–18).
- Evidence recall rose from 20–21 to 23–24 of 26.
- Cross-lingual evidence, the miss A3 found, went from 2–3 to 5–6 of 8. A
  hit in the right document with its figure one chunk away is exactly what a
  neighbour supplies.

**On `tabele` it is within noise.** The pass median went from 10 to 11 and
evidence was much the same. A table row is not helped by the chunk before
it, which holds other rows.

**Fixed ±1 does not add noise that costs answers.** That was the condition for
Phase C. No run regressed below its baseline, so C1 (a model deciding how far
to widen) is recorded as not needed, and C3 with it.

## For the next phases

- **D2** compares selection with this, with and without expansion.
- **E1** has a candidate for the default: expansion is a ~10 ms step with a
  repeated gain on the general corpus. The cost to weigh is context length,
  roughly 1.7–2.7× the chunks.

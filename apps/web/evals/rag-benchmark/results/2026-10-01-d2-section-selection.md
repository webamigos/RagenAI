# D2 — section selection against the reranker, with and without expansion

Phase D2 of [the selection spec](../../../../../docs/specs/2026-09-29-llm-document-selection.md),
run on 2026-10-01 against `b68f959bd` (D1: `sectionSelection`, a model in the
reranker's slot choosing from the same `maxDocuments × 3` pool).

## What was compared

- **Selection:** `sectionSelection` on, with `contextExpansion` off and then
  on. Three runs each on `kolej-bilingual-v1` rev 2 and
  `tabele-bilingual-v1` rev 1.
- **Selector:** `SELECTION_MODEL` unset, so the rephrase model,
  `mistral-small-3.2`. Every case's trace reads `selection`, or
  `selection + neighbours` for the turns that had a neighbour to add. There
  was not one `selection-failed`.
- **Reranker arms:** the same day's runs. Without expansion,
  [A3](./2026-10-01-a3-reranker-baseline.md)'s Scaleway arm. With expansion,
  [B4](./2026-10-01-b4-context-expansion.md)'s.

## Results

| corpus | arm | pass, runs 1/2/3 | evidence recall | cross-lingual evidence |
|---|---|---|---|---|
| kolej | Scaleway | 18/23, 17/24, 18/24 | 21, 20, 20 /26 | 3, 2, 2 /8 |
| kolej | selection | 17/24, 18/24, 16/24 | 21, 20, 20 /26 | 3, 2, 2 /8 |
| kolej | Scaleway + expansion | 20/23, 19/23, 21/24 | 23, 23, 24 /26 | 5, 6, 6 /8 |
| kolej | **selection + expansion** | 22/24, 21/24, 21/24 | 24, 24, 23 /26 | 6, 6, 6 /8 |
| tabele | Scaleway | 10/17, 8/18, 11/18 | 14, 13, 14 /18 | 4, 4, 4 /5 |
| tabele | selection | 9/18, 6/18, 7/18 | 15, 8, 10 /18 | 3, 2, 3 /5 |
| tabele | Scaleway + expansion | 10/18, 11/18, 12/18 | 13, 15, 15 /18 | 3, 4, 5 /5 |
| tabele | selection + expansion | 10/18, 9/18, 8/18 | 13, 13, 13 /18 | 4, 3, 4 /5 |

Cost and latency, from the traces and the organization's `ai_usage` rows:

| | selection | Scaleway reranker |
|---|---|---|
| p50 | 185–270 ms | 1 027 ms |
| p95 | 244–480 ms | 3 381 ms |
| per turn | ~1 865 input tokens and 6 output tokens on `mistral-small-3.2`; ~$0.0003 (252 calls, $0.078) | priced at zero by the price table, so its cost is not on the AI-usage page |

## What it says

**On prose, selection matches the reranker.**

- Medians are 17 vs 18 of 24 without expansion and 21 vs 20 with it. Both
  gaps are one case, which is noise.
- Evidence recall on `kolej` is identical, arm for arm.

**On tables, selection is worse and less steady.**

- Medians are 7 vs 10 of 18 without expansion and 9 vs 11 with it.
- Evidence across the three runs swings from 8 to 15 of 18, where the
  reranker held 13–15.
- The selector sees each candidate capped at 600 characters. A run of table
  rows cut at 600 characters often does not reach the row in question, so the
  selector cannot tell which chunk holds it.

**Selection is the cheaper and much faster step.** It takes about a fifth of
the reranker's latency at p50 and a seventh at p95, for a fraction of a cent
per turn.

**Expansion is the change that matters,** whichever step precedes it. It is
the only arm that moved cross-lingual evidence (2–3 → 5–6 of 8), and it did
so under both.

## Input to E1

- **Expansion:** a default-on candidate. It adds ~10 ms and has a repeated
  gain on the general corpus, with no loss on tables. The cost to weigh is
  context: 7–11 chunk positions per turn instead of 4, so a longer prompt
  on the chat model.
- **Post-retrieval step:** keep the reranker as the default. Selection
  matches it on prose and loses on tables. It stays opt-in for organizations
  that value latency more than table lookups. Raising the 600-character
  candidate cap for table chunks is the obvious thing to try before measuring
  it again.
- **Latency ceiling (D5):** expansion's p95 is 18 ms. Selection's is ~0.5 s,
  against the reranker's ~3.4 s. Neither step needs a ceiling lower than the
  reranker's.

# Contextual chunks A3 — the free prefix, measured

Phase A3 of [the contextual-chunks spec](../../../../../docs/specs/2026-09-29-contextual-chunks.md),
run on 2026-10-01 against main as of #1441: `contextualChunks` on, so every
chunk ingested on the run carries `context_prefix`, version 1.

## What was compared

- **Prefix arm:** title, section, and the summary's first sentence, embedded
  dense-only (`CONTEXT_PREFIX_IN_BM25` is `false`). Three runs each on
  `kolej-bilingual-v1` rev 2 and `tabele-bilingual-v1` rev 1, with Scaleway
  reranking and no expansion.
  - The harness uploads the corpus on every run, so each run ingests with the
    prefix.
  - The prefix was read back from Qdrant during the first run, e.g. `en 01
    refund policy — Ticket Refund Policy — Wolfsbane Interurban Rail > 4.
    Value threshold. This document outlines the ticket refund policy …`.
- **No-prefix arm:** [A3](./2026-10-01-a3-reranker-baseline.md)'s Scaleway
  runs, from the same day and the same stack.
- **Arms not run:** the spec asks for four, and two need a switch the code
  does not have. "Title + section, no summary sentence" and "the same,
  dense + BM25" are not run. The two arms here are the ones the code can
  produce.

## Results

| corpus | arm | pass, runs 1/2/3 | evidence recall | cross-lingual evidence |
|---|---|---|---|---|
| kolej | no prefix | 18/23¹, 17/24, 18/24 | 21, 20, 20 /26 | 3, 2, 2 /8 |
| kolej | **prefix** | **24/24, 23/23¹, 24/24** | **26, 26, 26 /26** | **8, 8, 8 /8** |
| tabele | no prefix | 10/17¹, 8/18, 11/18 | 14, 13, 14 /18 | 4, 4, 4 /5 |
| tabele | prefix | 8/18, 10/18, 9/18 | 12, 13, 11 /18 | 4, 4, 4 /5 |

¹ One case ungraded, excluded from the denominator.

**A caveat that applies to every 2026-10-01 run.** The collection held two
orphaned files with no database row, left by an earlier run:

- a second copy of `tabele`'s `pl-02-stawki-serwisowe.md`, 9 chunks;
- a Brain page.

All the day's arms ran against them, so the comparisons are like for like.
`tabele`'s absolute figures may still be slightly low, because one of its
documents has a stale duplicate to compete with.

## What it says

**On `kolej` the prefix closes the gap entirely.** Every question passed in
every run, and every figure the assertions look for reached the model, the
eight cross-lingual ones included. Those were the misses A3, B4 and D2
reported, and expansion had moved them only to 5–6 of 8.

The corpus is hard because four documents per language answer
the same kinds of questions with different figures. The prefix puts the
document's identity (operator, policy, section) into the vector, which
is exactly the distinction a bare chunk lacks.

**On `tabele` it does not help, and evidence is one to two figures lower.**
A table chunk's prefix names the document and section, which every chunk of
that table shares, so it adds no discrimination between rows. The summary
sentence adds prose to a vector that was mostly digits. The pass-rate
difference is within noise; the evidence difference leans the same way.

## What it means for the spec

- **D4 (which arm):** the summary-sentence arm, dense only, is the one
  measured, and it is the candidate. The two unrun arms are worth adding as
  a switch only if `tabele` is to be fixed this way. A table chunk is better
  served by its column header (ADR-43) than by its document's title.
- **Phase B (a model-written prefix):** not needed for prose. A3 leaves no gap
  on `kolej`. Tables are not a prefix problem.
- **D1 (default):** a default-on candidate for prose. Two things to weigh:
  - Only files ingested or re-indexed with the key on get the prefix
    (`reindex-for-context.ts`, #1447).
  - Table-heavy documents lose a little evidence. Leaving table chunks
    unprefixed would avoid that, and it is a small change to measure next.

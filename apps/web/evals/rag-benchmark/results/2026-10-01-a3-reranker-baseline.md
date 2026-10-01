# A3 — does the reranker move evidence recall?

Phase A3 of [the selection spec](../../../../../docs/specs/2026-09-29-llm-document-selection.md),
run on 2026-10-01 against `adf68e17b` (main plus #1448, which touches no
retrieval code). This is the baseline that Phases B–D are measured against.

## What was run

- **Arms:** reranking off and reranking with Scaleway (`qwen3-embedding-8b`).
  Cohere was not run: this machine has no `RERANK_COHERE_BASE_URL`, and the
  spec runs that arm only where credentials exist.
- **Corpora:** `kolej-bilingual-v1` rev 2 (24 questions) and
  `tabele-bilingual-v1` rev 1 (18 questions).
- **Repetitions:** three per arm and corpus, so 12 runs. The control arm (no
  retrieval) ran once per corpus and scored 1/24 and 0/18.
- **Stack:** chat `gemini-3-flash-preview`, judge `gemini-2.5-flash`,
  rephrase `mistral-small-3.2`, embeddings `bge-multilingual-gemma2`, one
  multi-query variant.
- **How the arms were set:** with the organization's `rerankingEnabled` and
  `FEATURE_FLAG_RERANKING=1` on the server. Every case's trace confirms the
  step the server actually ran: `reranker:scaleway` × 24 / × 18 on every
  Scaleway run, and `fusion` on every off run.
- **Setup:** a private database (`ragen_e2e_a2`), Redis db 5, local storage.

## Results

Pass rate is the RAG arm. Evidence recall counts the figures the assertions
look for that were in the chunks the server says it rendered (`lib/evidence.ts`).

| corpus | arm | pass, runs 1/2/3 | evidence recall, runs 1/2/3 | cross-lingual evidence |
|---|---|---|---|---|
| kolej | Scaleway | 18/23¹, 17/24, 18/24 | 21, 20, 20 /26 | 3, 2, 2 /8 |
| kolej | off | 19/24, 15/24, 17/24 | 21, 20, 20 /26 | 3, 2, 2 /8 |
| tabele | Scaleway | 10/17¹, 8/18, 11/18 | 14, 13, 14 /18 | 4, 4, 4 /5 |
| tabele | off | 7/18, 6/18, 6/18 | 8, 9, 8 /18 | 2, 2, 2 /5 |

¹ One case ungraded (the judge returned unreadable JSON). It is excluded from
the denominator, as the harness does.

Medians:

- **kolej:** Scaleway 18/24, off 17/24. Evidence recall is identical in every
  pairing.
- **tabele:** Scaleway 10/18, off 6/18. Evidence recall 14 vs 8 of 18.

## What it says

**On `kolej` the reranker changes nothing measurable.** Evidence recall is the
same in every pairing. The pass-rate difference is one case, under the
three-case noise floor the harness README sets, and run 1 of the off arm
scored higher than any Scaleway run. In other words, the four chunks fusion
ranks highest already hold the evidence on every question where any arm finds
it.

**On `tabele` it helps, by more than noise.** It adds six figures of
evidence and about four passing questions. The questions there target rows
in the last third of a table, and those rows are what the wider pool brings
into reach.

**What the "reranker" arm actually changes is two things at once.** With
reranking on, the chain retrieves `maxDocuments × 3` candidates and cuts them
to `maxDocuments`. With it off, it retrieves `maxDocuments` per query.
`tabele`'s gain therefore belongs to the wider pool *and* the reranker's
order, and this run cannot split them. That matters for the spec: selection
(D1) cuts the same widened pool. So D2's comparison against this Scaleway arm
is like for like, and an "off but widened" arm would be the one to add if the
split ever matters.

**The miss that remains is cross-lingual, and the reranker does not touch
it.** On `kolej` 18/18 of same-language evidence is in context in every run,
against 2–3 of 8 cross-lingual. That is a retrieval miss rather than an
answer miss, and it is the case contextual chunks (title and section in the
embedding) and selection are meant to move.

## For the next phases

- **B4** (expansion on vs off) runs on top of the Scaleway arm, which stays
  the default.
- **D2** compares selection with the Scaleway arm above: kolej 18/24 and
  20/26 evidence, tabele 10/18 and 14/18.
- **Contextual A3** should report the cross-lingual row separately, because
  that is where the headroom is.

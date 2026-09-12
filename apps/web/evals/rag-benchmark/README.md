# Multilingual RAG benchmark

A dated, reproducible number for what retrieval actually delivers — including
a **per-language breakdown**, which nothing else in this repository produces.

```bash
npm run eval:benchmark                       # the corpus that ships here
npm run eval:benchmark -- --corpus ./my-docs # your documents
```

Results land in [`results/`](./results) as `<date>-<corpus>.json` and
`<date>-<corpus>.md`, stamped with the models, flags and commit they came from.

## Why this exists next to the other two harnesses

| Harness | Retrieval | Languages | What a number from it means |
|---|---|---|---|
| `evals/configs/*.yaml` (promptfoo) | **no** — `fixtures/mock-vector-store.ts` scores 8 English FAQ chunks by keyword overlap | English | "given roughly the right paragraph, did the model answer well?" |
| `evals/e2e-rag/` | yes | Polish, one document | "does the shipped stack work end to end today?" — a smoke test, 5–6 questions |
| **this** | yes | Polish **and** English, both directions | "how often does the pipeline find the right fact, and how much of that is the pipeline rather than the model?" |

[ADR-20](../../../../docs/adrs/20-pause-and-measure-rag-quality.md) asked for a
measurement week and named four signal categories. This covers the part that
can be measured from a checkout without production access; see
[`docs/rag-measurement-2026-09-12.md`](../../../../docs/rag-measurement-2026-09-12.md)
for what each category got and what it did not.

## The two things that make the number mean something

**Every figure in the corpus is invented.** A benchmark built from real public
documents cannot separate retrieval from recall — the model may already know
the answer, so a correct answer proves nothing. `87%`, `2 847`, `EUR 184.00`,
`4 180 000 zł` exist nowhere outside this directory, so a correct answer is
evidence that retrieval worked. This is the same reasoning as
[`e2e-rag`](../e2e-rag/README.md)'s fictional company, applied to a corpus
large enough to slice.

**There is a control arm.** Every question is also asked of the same model with
no documents attached. Whatever that scores is the floor: the part of the
result the product did not contribute. A RAG pass rate published without its
control is unfalsifiable, and the gap between the two columns — not the RAG
column — is the number worth quoting.

## The corpus that ships here

[`corpora/kolej-bilingual-v1`](./corpora/kolej-bilingual-v1) — CC0, eight
documents, two fictional rail operators:

- **four Polish** documents (Kolej Nadwiślańska S.A.) — refund rules, baggage,
  delay compensation, board minutes;
- **four English** documents (Wolfsbane Interurban Rail) — the same four
  subjects, structured the same way, with **every number different**.

Both sets are ingested into one collection, which is what makes the corpus
hard. Ask for a refund percentage and four documents contain a refund
percentage; three of them are wrong. Every `expectNone` in `questions.json` is
a real figure from a sibling document, so a right-shaped answer pulled from the
wrong document fails instead of passing — the discrimination the existing
fixtures cannot exert, and the reason the 2026-09-04 reranker comparison came
out as a three-way tie.

24 questions, evenly split: 12 asked in Polish, 12 in English; 12 answered by a
Polish document, 12 by an English one. Eight of them are **cross-lingual** —
asked in one language about a document written in the other, which is the case
`bge-multilingual-gemma2` was chosen for and which nothing else here tests.

Question types follow ADR-20 §3: `factual`, `numeric`, `comparative`,
`multi-hop`, `cross-lingual`, plus two guards — `guard-hallucination` (asks
something no document covers) and `guard-sycophancy` (asserts a false premise
the answer must correct).

## Grading

Two gates, both must pass:

1. **Substring assertions** over the invented figures (`expectAll`,
   `expectAny`, `expectNone`). Spacing inside numbers and the decimal comma are
   normalised, so `4 180 000`, the same figure written with non-breaking spaces
   (U+00A0, U+202F), and `4180000` all compare equal.
2. **An LLM judge** against the question's rubric, for what a substring cannot
   see: did it refuse rather than invent, did it correct the false premise, did
   it compare both deadlines instead of reciting one.

A judge alone rewards a confident wrong number; substrings alone pass an answer
that contains `87` while denying it. Both, or the case fails.

## Running it on your own documents

A corpus is a directory holding three things:

```
my-docs/
  corpus.json      # documents, their languages, their mime types, a licence
  questions.json   # questions with lang, docLang, type, expectations, rubric
  docs/…           # the files themselves
```

Copy [`corpora/kolej-bilingual-v1`](./corpora/kolej-bilingual-v1) and replace
its contents. `run.ts` knows nothing about the corpus that ships with it. The
loader refuses a corpus that would produce a meaningless report — a duplicate
question id, a language the manifest does not declare, or a question with
neither an expectation nor a rubric, which would pass unconditionally and
inflate every rate it appears in.

**Write questions whose answers are not on the public internet.** If your
documents are public, the control arm will score well and the benchmark will
tell you nothing about retrieval. That is not a flaw in the harness — it is the
measurement being honest.

## Prerequisites

The same live stack [`e2e-rag`](../e2e-rag/README.md) needs, minus Docling
(the corpus is Markdown, so nothing goes through PDF parsing):

```bash
docker compose up -d postgres qdrant redis temporal litellm-postgres litellm \
  presidio-analyzer presidio-anonymizer
```

Then `apps/web` and `apps/worker`, both against the same database and the same
storage directory:

```bash
# apps/web
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_e2e \
STORAGE_PROVIDER=local STORAGE_LOCAL_PATH=/tmp/ragen-eval-storage \
npm run web:dev

# apps/worker
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_e2e \
STORAGE_PROVIDER=local STORAGE_LOCAL_PATH=/tmp/ragen-eval-storage \
npm run worker:dev
```

Port **55432**, not 5432: a native Postgres on the standard port answers
instead of the container and reports success while talking to the wrong
database. Use a scratch database — the run uploads files and then deletes them.

Then:

```bash
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_e2e \
  npm run eval:benchmark
```

### Knobs

| Variable | Default | Why you would change it |
|---|---|---|
| `RAG_EVAL_CONTROL_MODEL` | `gemini-3-flash-preview` | The control arm's model. Set it to the chat model so both columns share one, or to a stronger one to ask "does retrieval still beat a better model with no documents?" |
| `RAG_EVAL_JUDGE_MODEL` | `gemini-2.5-flash` | The grader |
| `RAG_EVAL_APP_URL`, `RAG_EVAL_EMAIL`, `RAG_EVAL_PASSWORD`, `RAG_EVAL_PROJECT_ID`, `RAG_EVAL_THREAD_ID` | the e2e seed's values | Running against a different instance or tenant |
| `RAG_EVAL_TIMEOUT_MS` | `600000` | Ingestion of the whole corpus, not one file |
| `--arms rag` / `--arms no-rag` | both | Skipping the control halves the cost of a re-run you only want a delta from |

`INTERNAL_API_SECRET` is not required but is strongly wanted: cleanup deletes
the uploaded files through the product's own delete path, which is what also
removes their Qdrant points. Without it the files are left behind and the next
run ranks against duplicates. The runner says so rather than failing.

## One run is not a baseline

These are LLM-scored and they move. Two runs of the same corpus on the same
stack, on the same day, differed on four cases that had no instrument change
between them — a sixth of the suite. Record the median of at least three runs
before quoting a figure, and treat a single-run delta under about three cases as
noise. The results in [`results/`](./results) are individual runs and are named
so they cannot overwrite each other.

## What this does not measure

- **Latency.** Durations are recorded per case in the JSON, but nothing
  asserts on them.
- **Anything about real users.** ADR-20 categories 1, 3 and 4 — Langfuse
  pipeline health, spot-checks of real queries, and user feedback — need
  production access or a feedback mechanism that does not exist yet. A
  benchmark is not a substitute for any of them.
- **A comparison against other products.** The control arm is the same model
  without retrieval, not ChatGPT, Claude or Notion AI. Comparing against a
  product means driving that product's own interface on the same corpus, which
  this harness does not do and which their terms may not allow.

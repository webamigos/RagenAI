# The gateway arm, compared per question

Phase B2c. Both arms of `LLM_GATEWAY` run against the same 24 questions, in one
sitting, on one machine, at commit `269b13422` — three runs each,
`kolej-bilingual-v1` rev 2.

[The baseline](rag-baseline-2026-09-14-before-the-gateway.md) asked for exactly
this and said why: three identical proxy runs spanned four questions, so **a
summary rate cannot tell a real difference from the same path measured twice.**
This document therefore leads with the per-question result and puts the totals
second, where they belong.

## The answer

**Retrieval is unchanged.** Nineteen of twenty-four questions return the
identical verdict in both arms across all six runs — seventeen passing 3/3 in
both, and two failing 0/3 in both, which the corpus already failed before the
gateway existed. Of the five that differ, four flap *within* an arm, which is
the documented noise floor rather than a finding.

**One question differs stably: `xl-en2pl-refund-pct` — 0/3 native, 3/3 proxy.**
It is the only case in the corpus where the two paths disagree reproducibly, and
it is **not a retrieval failure**. Both arms retrieve the right document and
state the right figure. See below.

## Per question

| question                      | native | proxy | |
| ----------------------------- | ------ | ----- | --- |
| en-mono-baggage-weight        | 3/3    | 3/3   | |
| en-mono-compare-deadlines     | 3/3    | 3/3   | |
| en-mono-guard-hallucination   | 3/3    | 3/3   | |
| en-mono-guard-sycophancy      | 3/3    | 3/3   | |
| en-mono-multihop-cockatrice   | 3/3    | 3/3   | |
| en-mono-refund-deadline       | 3/3    | 3/3   | |
| en-mono-refund-pct            | 3/3    | 3/3   | |
| en-mono-refund-threshold      | 3/3    | 3/3   | |
| pl-mono-baggage-weight        | 3/3    | 3/3   | |
| pl-mono-compare-deadlines     | 2/3    | 3/3   | flaps |
| pl-mono-guard-hallucination   | 3/3    | 3/3   | |
| pl-mono-guard-sycophancy      | 3/3    | 3/3   | |
| pl-mono-multihop-bazyliszek   | 3/3    | 3/3   | |
| pl-mono-refund-deadline       | 3/3    | 3/3   | |
| pl-mono-refund-pct            | 3/3    | 3/3   | |
| pl-mono-refund-threshold      | 3/3    | 3/3   | |
| xl-en2pl-baggage-liability    | 3/3    | 3/3   | |
| xl-en2pl-bike-fare            | 0/3    | 0/3   | fails in both — pre-existing |
| xl-en2pl-min-payout           | 1/3    | 2/3   | flaps |
| **xl-en2pl-refund-pct**       | **0/3**| **3/3** | **differs, stably** |
| xl-pl2en-baggage-liability    | 3/3    | 2/3   | flaps |
| xl-pl2en-bike-fare            | 0/3    | 0/3   | fails in both — pre-existing |
| xl-pl2en-delay-threshold      | 3/3    | 3/3   | |
| xl-pl2en-refund-pct           | 0/3    | 1/3   | flaps |

## The one real difference, and why it is not a retrieval regression

`xl-en2pl-refund-pct` asks, in English, what Kolej Nadwiślańska refunds — a
Polish document's figure, 87%. The corpus's sibling English operator has its own
refund policy at 62%, and the question carries `expectNone: "62"`, because a
right-shaped answer lifted from the wrong company's document has to fail.

**Both arms answer 87%, cite the same document, and pass the rubric — all six
runs.** The difference is that the native arm volunteers the other figure as
well:

> **proxy** — "Kolej Nadwiślańska S.A. refunds 87% of the ticket price … The
> remaining 13% is retained as a non-negotiable handling fee [1]."

> **native** — "…refunds **87% of the fare** … However, there is a discrepancy
> in the provided documents, as the English-language refund policy states a
> refund of **62% of the fare** …"

So the gateway did not retrieve worse. It produced a longer answer that
surfaces a conflict between two retrieved documents, and the `expectNone` guard
— doing exactly the job it exists for — fails it.

Whether that is a product regression is a judgement, not a measurement. Asked
specifically about one operator, naming another operator's number is arguably
the worse answer, which is the reading the corpus encodes.

**What changed is generation, not routing of the query.** Both arms use
`gemini-3-flash-preview`; the chain sends no temperature (only an optional
`maxOutputTokens`), so each path inherits its client's defaults. The proxy
reaches Vertex through LiteLLM's OpenAI-compatible translation; the gateway
reaches it through `@ai-sdk/google-vertex`. The two therefore differ in
generation defaults and in how the system prompt is carried, and the divergence
shows up only on the one question whose grading is sensitive to an extra
sentence. That is worth knowing before B4 flips the default, and it is not
addressed here.

## The totals, second

| | runs | median |
| --- | --- | --- |
| **proxy** — all questions | 21/24, 20/24, 21/24 | **21/24 (88%)** |
| proxy — same language | 16/16, 16/16, 16/16 | 16/16 |
| proxy — cross-lingual | 5/8, 4/8, 5/8 | 5/8 |
| proxy — control | 0/23 ×3 | 0 |
| **native** — all questions | 18/23, 20/24, 19/24 | **19/24 (79%)** |
| native — same language | 15/15, 16/16, 16/16 | 16/16 |
| native — cross-lingual | 3/8, 4/8, 3/8 | 3/8 |
| native — control | 0/23 ×3 | 0 |

Nine points apart, and **the per-question table above says one question of that
is real.** The rest is the instrument: the baseline's own three identical runs
spanned 17/20/21, which is wider than this gap. Quoting 88% against 79% as a
regression would be reading noise as signal — the mistake the baseline was
written to prevent.

Same-language retrieval is **16/16 in every run of both arms**. The entire
difference lives in the cross-lingual half, where the baseline already put the
pipeline's only real weakness — and which Phase B does not touch, because
routing a model call elsewhere does not change how a Polish query embeds against
an English chunk.

The control arm is 0/23 in all six runs, one case ungraded
(`en-mono-guard-sycophancy` times out, reproducibly, as it did in the baseline).
Nothing in the corpus is answerable from the model's own knowledge on either
path, so every pass above is evidence of retrieval.

## What this run is allowed to conclude

- **No retrieval regression.** Sixteen questions identical, same-language
  perfect in both arms, control floor unchanged.
- **One reproducible behavioural difference**, in answer composition rather than
  retrieval, on one cross-lingual question.
- **Not enough to call the arms equal on cross-lingual.** 5/8 against 3/8 over
  three runs each, on a corpus whose noise floor is four questions, is a
  direction and not a result. If cross-lingual quality matters at the flip, it
  needs its own larger measurement, not more runs of this one.

## Reproducing

```bash
docker compose up -d postgres qdrant redis temporal litellm-postgres litellm \
  presidio-analyzer presidio-anonymizer

# one arm, then the other — the app's own healthcheck records which
LLM_GATEWAY=native DATABASE_URL=…/ragen_e2e STORAGE_PROVIDER=local \
  STORAGE_LOCAL_PATH=/tmp/ragen-eval-storage npm run web:dev
# …and the same for npm run worker:dev

cd apps/web && DATABASE_URL=…/ragen_e2e npm run eval:benchmark
```

Each report's fingerprint carries `llmGateway`, **asked of the app rather than
read from the harness's environment** — a run stamped `native` that the app
served through the proxy is the one failure this comparison could not otherwise
detect, because both arms produce believable numbers either way.

Raw reports: `apps/web/evals/rag-benchmark/results/` — `…-rev2-run5/6/7.json`
(native) and `…-rev2-run8/9.json` plus `2026-09-15-…-rev2.json` (proxy).

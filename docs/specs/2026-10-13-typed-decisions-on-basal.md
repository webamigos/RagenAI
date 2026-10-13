---
title: A self-hosted basal model clears guardrail checks before the judge model is asked
status: approved
areas: [guardrails, rag, companion-services, env]
adrs: [20, 37, 38, 49, 50]
---

# A self-hosted basal model clears guardrail checks first

## TLDR

Every input turn waits for a judge model before the assistant starts
answering: `gemini-2.5-flash`, with a 3 s timeout, once for
`jailbreak-detection` and once for each of an organization's `LLM_POLICY`
rules. basal is a local model that answers a closed question in 15–40 ms with a
calibrated probability. Here it gets a first look at each judged rule, and the
judge model is asked only when basal is unsure.

The non-obvious part is that basal is much less accurate than the judge it
sits in front of: 72–78 % against ~99 % on its author's benchmark. So it gets
exactly one power. **basal may clear a message, never convict one.** It can
pass a turn it is sure is benign. Anything it suspects, defers or cannot
answer goes to the judge model, exactly as today. A basal mistake can
therefore let an attack through, which Phase A measures before anything
ships. It can never block a customer.

## Decisions

Answered 2026-10-13. Each recommendation was accepted.

- **D1 (was Q1). One seam and one consumer.** A thin basal client plus its
  first consumer. Every further consumer gets its own small spec (see
  [Next](#next-separate-specs)).
- **D2 (was Q2). The first consumer is the guardrail judge.** The reranker
  slot comes next, in its own spec.
- **D3 (was Q3). basal is an optional companion service, like Presidio.** It
  is off unless `BASAL_URL` is set. Railway has no GPU, so a production-grade
  basal on the demo means a GPU host elsewhere. A CPU trial on Railway is
  still wanted, as an optional step (B4), not a requirement.
- **D4 (was Q4). No new abstraction and nothing in `routes.yaml`.**
  - A thin `packages/basal-client` holds the HTTP call, the types and
    `isBasalConfigured()`. A `basal` fragment goes in `@ragenai/env`.
  - The clearing logic lives in `packages/guardrails`, not in its two
    bindings. `guardrails-are-not-recopied` asserts there are exactly two
    bindings, and two copies of the logic would drift apart silently.
- **D5 (was Q5). Opt-in per organization and gated by language.** The
  `guardrailFirstPass` feature key defaults to `false`. A turn whose language
  is not confidently Polish or English goes straight to the judge model.
- **D6 (was Q6). Down, slow and unsure all mean "ask the judge model".** The
  first pass never turns a judgement that would have been made into a pass.
- **D7 (was Q7). Internal use only.** Customers get no decision API.

## Research: what basal is

Sources: [basal.si5.pl](https://basal.si5.pl/), the launch article
([`/blog/basal-2-0/`](https://basal.si5.pl/blog/basal-2-0/)), the benchmark
and Lab pages, and [github.com/rkinas/basal](https://github.com/rkinas/basal).
Read on 2026-10-13. Author: Remigiusz Kinas. Launched 2026-10-14. Weights are
Apache-2.0.

**What it does.** It is a decision model and does not generate text. The
request carries a `state` (text, or image/audio for omni) and a map of named
questions, each listing its allowed answers. In one forward pass the model
reads the probability of every option code. It returns a distribution, not a
label to parse. The label set is defined per request, so nothing is retrained
per use case.

**Question types.**

| Type | Answer | Notes |
| --- | --- | --- |
| `choice` | one key, plus a probability per option | up to 255 options (20 under Ollama) |
| `noul` | P(yes) | yes/no |
| `score` | expected level plus distribution | ordered scale, lowest first |
| `multi` | selected labels, P per label | independent yes/no per label; experimental |
| `act` | the action with the lowest expected cost, from a `costs` matrix | experimental |
| `tool` | a tool name, or `answer_directly` / `ask_user` / `none` | next tool for an agent; experimental |

Per question, `max_error` sets a calibrated error target. Below it, the answer
comes back `deferred: true`. One request can carry several questions over the
same state.

**Models.**

| Family | Sizes | Base | Input |
| --- | --- | --- | --- |
| basal-2.0 | mini 1.5B, 4.5B, max 11B | Bielik | text, Polish and English |
| basal-omni-1.0 (experimental) | mini 4B, max 12B | Gemma 4 | text, image, audio ≤ 30 s |

**Numbers, from the author's own benchmark.** Werdykt v1: 5,000 unpublished
questions, 10 categories, Polish and English, measured on one H100.

| Model | Accuracy | p50 | p95 | Auto-decided at a 5 % error target |
| --- | --- | --- | --- | --- |
| basal-2.0-mini | 61.8 % | 15.5 ms | 94 ms | — |
| basal-2.0 (4.5B) | 72.9 % | 25.0 ms | 188 ms | 51.3 % (5.08 % observed) |
| basal-2.0-max | 78.4 % | 37.4 ms | 344 ms | 65.6 % (4.51 % observed) |
| frontier APIs (Gemini 3.8 Flash, Claude Opus 5.5, GPT-6.x) | 98.3–99.6 % | 2.0–5.5 s | — | not comparable (no probabilities) |

The weakest category is rules and deadlines (0.31–0.38). The strongest is
decisions about RAG systems, 0.97 for max. On a fully loaded H100 a decision
costs $0.01–0.07 per 1,000. The page warns that self-hosting at low traffic
costs more per decision.

**Running it.**

- The server is `basal-serve` (Python). It runs on NVIDIA (fast, fp8, vLLM,
  SGLang), on Apple Silicon (MLX), or behind Ollama / llama.cpp (GGUF).
- One model per process.
- Endpoints: `POST /v1/systemone`, `GET /health`, `GET /v1/models`, and MCP
  (`decide`, `decide_many`) behind `--mcp on`.
- **It has no authentication.**
- Calibration is per engine port. Re-check a threshold after any change of
  model, quantisation or engine.

**What its own docs say not to use it for:**

- free-text answers;
- arithmetic;
- world knowledge that is not in the state;
- consequential decisions about people without human review.

Thresholds from the benchmark are not production settings. Refit them on your
own labelled data.

## Where basal fits in Ragen today

These call sites ask a model a closed question: a fixed label set, a yes/no or
a score. They are listed in order of fit.

| # | Call site | Today | basal type | Note |
| --- | --- | --- | --- | --- |
| 1 | **Guardrail judges** (`jailbreak-detection`, `LLM_POLICY`). Logic in `packages/guardrails/src/evaluator/policy.ts`; bindings `apps/web/src/features/guardrails/utils/policy-judge.ts` and `apps/api/src/guardrails/policy-judge.service.ts` | `gemini-2.5-flash`, 3 s timeout per rule, threshold 0.7, on every input turn before the answer starts | `noul` + `max_error` | **this spec** |
| 2 | **Reranker slot** (`apps/web/src/libs/reranker/`, `RERANK_SEAM` in `packages/env`) | Scaleway, ~1 s p50 / 3.4 s p95 | `score` per candidate | next spec; already falls back silently to fusion order |
| 3 | **Section selection** (`packages/rag-core/src/selection/select-sections.ts`) | LLM, ~0.2 s / 0.5 s, 8 s timeout | `multi` or `score` | measured against the reranker in D2 on 2026-10-01 |
| 4 | **Brain contradictions** (`packages/brain-core/src/contradictions/judge.ts`) | LLM over pairs of pages, in the worker | `choice` | worker, so cost only |
| 5 | **Worker classifiers**: suggestion type, "did the suggestion improve it", memory `ADD/UPDATE/DELETE` | `generateObject` with an enum | `choice` / `noul` | cost only |

Ragen does not do the following today, and basal would make each cheap enough
to add. Each is a new behaviour, so each would get its own spec:

- a sufficiency check before answering ("answer / search again / sources
  conflict"). Today there is only the `answerFromDocumentsOnly` prompt flag;
- a grounding check of each answer sentence against its source;
- prompt-injection detection in **retrieved chunks**. Today the jailbreak
  judge sees only the user's message;
- narrowing the MCP tools before `streamText`. Today every connector tool is
  passed, up to `MAX_TOOL_STEPS`.

These are not a fit:

- Rephrasing and multi-query expansion generate text.
- The RAG readiness score asks for five 0–10 judgements over a whole document.
  That is long-context work, where a 4.5B model is not strong.

## Problem

- **Every input turn waits for a judge model before it can start.**
  - The input stage runs `jailbreak-detection` (when it is on) and up to three
    operator `LLM_POLICY` rules. They run concurrently, each with a 3 s
    timeout (`POLICY_JUDGE_TIMEOUT_MS`).
  - The assistant's model is not asked until the slowest judge returns.
  - Almost every message is an ordinary business question that a judge scores
    0.0–0.2, so most of that wait buys nothing.
- **Each judged rule is a paid model call per turn, for ever.** That is the
  reason for `MAX_ACTIVE_LLM_POLICIES = 3` (`docs/guardrails.md`, "Policy
  rules run last, concurrently, and capped"). The cap limits what an
  organization can express, not just what it spends.
- **The judge's text leaves the installation.** The input is masked by
  Presidio first, but a self-hosted customer who wants no third-party model on
  the guardrail path has no way to get there today.

How much latency the judge adds per turn is **not measured yet**: the traces
have it, but nobody has read them. Phase A reads them first. If the judge turns
out not to be on the critical path, the case for this spec is only cost and
data residency, and A3 records that.

## Out of scope

- **Output-stage rules.** An output `LLM_POLICY` judges a finished answer.
  Clearing it faster helps a little, but the answer is already written. That
  is a second step once input has numbers.
- **`content-moderation`.** It is OpenAI's moderation endpoint, which returns
  a flag, not a judge score.
- **Raising `MAX_ACTIVE_LLM_POLICIES`.** It may become possible once basal
  clears most turns, but every rule basal defers still costs a judge call. The
  cap is a separate decision, made on Phase C's numbers.
- **Every other consumer** in the table above, and the four new behaviours.
- **basal-omni** (images, audio). It is experimental upstream, NVIDIA-only,
  and guardrails see text.
- **Customer-facing decisions** (D7).
- **Changing the judge model, its prompts or its threshold.** The first pass
  sits in front of the judge and does not alter it.

## Proposed solution

### The rule: basal clears, the judge model convicts

For each judged rule on an input turn, `evaluateInputStage` asks basal first,
when the first pass is available (see below):

```
basal says "no" (benign), not deferred,
and P(yes) < the rule's threshold     → scored, with score = P(yes). No judge call.
anything else                          → the judge model, exactly as today.
```

"Anything else" covers these cases:

- basal says yes;
- basal defers (`max_error`);
- basal times out (`BASAL_FIRST_PASS_TIMEOUT_MS`, 300 ms);
- basal errors or is unreachable;
- basal's `P(yes)` lands on the other side of the rule's own threshold from
  its own answer. For example, an operator set the threshold to 0.2 and basal
  said "no" with P(yes) = 0.3.

A cleared rule produces a normal `{ outcome: 'scored', score }`. The hit and
threshold logic, the result order and the cap all stay unchanged. A cleared
rule is by definition below its threshold, so it is never a hit. `deps.record`,
which receives "the judge's 0–1 score" and feeds the security events, is called
only for hits. **A basal probability therefore never reaches an event as a
judge score.** C1 asserts this.

**Input stage only, structurally.** `runPolicyRules` is also called by
`evaluateOutputText` and by `runPolicyTrial`, the panel's "test this policy"
box. The first pass travels as an optional `firstPass` on `InputStageDeps`,
and only `evaluateInputStage` hands it on to `runPolicyRules`. If the trial box
got it, an operator tuning a threshold would see basal's P(yes) presented as
the judge's score. That is a preview running a different path from the real
turn, the failure in
[this lesson](../lessons/a-test-box-that-runs-a-different-path-is-worse-than-none.md).
A test asserts that the output stage and the trial never receive it.

**Why only clearing.** Clearing and convicting fail in different ways:

- A false conviction blocks a customer's legitimate question. On a 72–78 %
  model that would be a support case every day.
- A false clearance lets one attack past one detector. The system prompt, the
  untrusted-content wrappers and the output stage still stand behind it.

Phase A must show that the false-clearance rate is low enough. If it is not,
the spec stops there.

### What basal is asked

`basalQuestionFor(rule, text)` lives in `packages/guardrails`, next to
`judgeRequestFor`, and the package chooses the question. It is the same
decision `judgeRequestFor` already owns, for the same reason: two runtimes free
to phrase it would phrase it differently.

- **`jailbreak-detection`**: a `noul` with instructions fixed in code, taken
  from `JAILBREAK_SYSTEM_PROMPT`'s list of what counts as manipulation. The
  `state` is the masked message, truncated to `POLICY_JUDGE_MAX_INPUT_CHARS`.
- **`LLM_POLICY`**: a `noul` whose instructions are the operator's policy
  prose, with the same state. The judge's note that placeholders such as
  `<PERSON_1>` stand for real values goes into the instructions verbatim.
- **`max_error`**: `BASAL_GUARDRAIL_MAX_ERROR`, a package constant. Its value
  comes from Phase A, not from the benchmark page.

Each rule is its own request. basal batches concurrent requests on the server
(a 3 ms window), and per-rule calls keep `runPolicyRules`' one-rule-one-result
shape. One request with several questions is an optimisation for later, if
Phase C shows it is needed.

### When the first pass runs

All four conditions must hold. They are checked in this order:

1. `isBasalConfigured()`: `BASAL_URL` is set.
2. The organization's `guardrailFirstPass` feature key is on. It defaults to
   `false`.
3. The language gate passes. `franc` is restricted to the languages of the 15
   UI locales and needs a minimum length. It must detect `pol` or `eng`.
   `und` (too short, or not confident) **fails** the gate. That is the
   conservative choice: a short message goes to the judge as it does today.
   For an `LLM_POLICY` rule the gate also reads the **policy prose**, because
   it becomes basal's instructions, and an operator may write it in German.
   A policy detected confidently as anything but `pol` or `eng` skips basal
   for that rule. `und` passes here, because a short policy is usually
   unambiguous and the message has already been gated. The detection is
   computed once per rule text and cached, not on every turn.
4. The stage is `INPUT`. This is structural (see above), not a runtime check.

When any condition fails, the turn goes through the judge model as today, with
no extra latency.

### Where the code goes

| Piece | Location | Why there |
| --- | --- | --- |
| HTTP client, request and response types, the breaker, `isBasalConfigured()`, `modelId()`; the timeout is a parameter | new `packages/basal-client` | used by web and api; the reranker spec will reuse it from rag-core |
| `BASAL_URL`, `BASAL_API_KEY` (optional, for a proxy in front) | `basal` fragment in `@ragenai/env`, using `httpUrl()` | ADR-37: a variable read by two apps is declared once |
| `basalQuestionFor`, the clearing rule, `BASAL_GUARDRAIL_MAX_ERROR`, `BASAL_FIRST_PASS_TIMEOUT_MS` | `packages/guardrails` | the package owns the question, the decision and its numbers |
| The language gate | `packages/guardrails` (takes `franc` as a dependency; it is ESM-only, which apps/api now is too) | same reason: both runtimes must gate the same way |
| Wiring | both judge bindings put a `firstPass` on `InputStageDeps`; `evaluateInputStage` hands it to `runPolicyRules` | `runPolicyRules` stays package-only in `guardrails-are-not-recopied`; the test also asserts both bindings supply `firstPass` |
| `guardrailFirstPass` | `packages/platform-contracts`: `FEATURE_KEYS`, `DEFAULT_FEATURES` (`false`, with a comment on why) and `FEATURE_LABELS` | per org, admin-managed |

**The timeout is a package constant, not an env var.** `docs/guardrails.md`
makes the judge's numbers constants that "none is configurable", so the two
runtimes cannot differ. The first pass follows the same rule. Only the
address and the key are per installation.

### Alternatives rejected

- **basal replaces the judge.** At 72–78 % it would block legitimate turns, and
  no threshold makes a less accurate model safe in both directions.
- **basal decides both ways, with a tight `max_error`.** It is cheaper still,
  but convictions would come from the less accurate model. The asymmetry above
  is the whole design.
- **basal as an `openai-compatible` route in `routes.yaml`.** basal does not
  speak the chat API, and the gateway resolves only chat and embedding models
  (ADR-49).
- **basal through its MCP endpoint.** MCP is the extension API for tools that
  a model calls (ADR-38). This is a call Ragen makes itself on every turn,
  where plain HTTP with a timeout is the honest shape.
- **Shadow mode on real traffic first.** It would be the best evidence, but
  there is no production deployment, and the demo has no GPU. The labelled set
  in Phase A is the gate. Shadow mode is worth revisiting once a self-hosted
  customer runs basal.
- **A new `DecisionProvider` abstraction with basal and LLM backends.** There
  is one consumer. The guardrail judge already is the LLM backend, so a second
  abstraction would wrap a seam that exists.

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `packages/guardrails` | `basalQuestionFor`, the clearing rule, the language gate, `firstPass` on `InputStageDeps` | package tests; `guardrails-are-not-recopied` (extended: `basalQuestionFor` is package-only, and both bindings supply `firstPass`) |
| `packages/basal-client` (new) | the HTTP client | its own tests; web and api builds |
| `packages/env` | `basal` fragment | fragment tests; `provider-fragments-carry-their-rules` |
| `packages/platform-contracts` | `guardrailFirstPass` feature key and label | package tests; `shared-contracts-are-not-recopied` |
| `docker-compose.yml`, `infra/basal/` | optional `basal` profile (NVIDIA) | `docker compose --profile basal config` in B1 |
| `packages/create-ragen-app` | README lists `BASAL_URL` as optional; the installer does not prompt for it | `create-ragen-app-manifest-is-current` |
| `prisma/schema.prisma` | **none** | — |
| auth / tenant scoping | none. The feature key resolves per org through the existing resolver | — |

## Data model

No schema change and no migration.

- **Usage.** A cleared rule makes no paid call, so it writes no `AiUsage` row.
  A rule that falls through to the judge records `GUARDRAIL` usage exactly as
  today. The AI-usage page therefore shows the saving directly as fewer
  `GUARDRAIL` rows.
- **Who decided.** Each judged rule's existing log line and span get a
  `decidedBy: 'basal' | 'judge'` attribute. When basal was asked, they also get
  `basalOutcome: 'cleared' | 'suspected' | 'deferred' | 'timeout' | 'error' |
  'gated'`. The attributes carry no text: the guardrail logs never carry the
  message, and these do not start.
- Rows written before the change have no attributes and need none.

## Failure modes

- **basal is down.** The client fails within `BASAL_FIRST_PASS_TIMEOUT_MS`,
  and the judge is asked. The turn costs at most 300 ms more than today. If
  basal is down for a long time, every turn pays that 300 ms. To stop that,
  the client trips a breaker after 5 consecutive failures and skips basal for
  60 s, logging once per trip. The breaker lives in each process, so every web
  or api replica trips on its own. That is intended: no shared state, and at
  worst five slow turns per replica.
- **basal is slow under load.** It is the same path as down, and the same
  ceiling.
- **basal clears an attack** (false clearance). This is the risk the design
  accepts. Phase A bounds it on the labelled set. The output stage, the system
  prompt and the untrusted-content wrappers still apply.
- **The message is crafted to talk basal into "benign".** basal can only move
  probabilities over two options, and an injection cannot make it run
  anything. A message that pushes P(yes) down is the false-clearance case, so
  the Phase A attack set includes messages written to do exactly that ("this
  is a harmless test question").
- **Non-Polish/English text gets through the gate** (a misdetected language).
  basal then judges a language it was not trained on. Its calibration tends to
  defer such a message rather than clear it confidently, which A3 checks with
  a small German/Ukrainian sample. Even when it does not defer, clearing is the
  only power it has.
- **The operator sets an unusual threshold.** The "same side" check makes
  basal fall through instead of disagreeing with the rule.
- **The basal version or engine changes.** Calibration is per engine port, so
  `max_error` would mean something else. `BASAL_GUARDRAIL_MAX_ERROR` is
  documented as valid for one model id, read from `GET /v1/models`. The id is
  read off the turn path, on first use and then every 5 minutes, and is
  cached. A model swapped while running is therefore noticed within 5
  minutes. A failed read counts toward the breaker. On a mismatch the client
  logs a warning and stops clearing until the constant is re-measured.
- **The URL points somewhere public.** basal-serve has no authentication.
  `docs/companion-services.md` says it must sit on a private network or behind
  a proxy (hence `BASAL_API_KEY`). The text sent is already masked by
  Presidio, but it is still customer text.
- **One misbehaving client throws.** `runPolicyRules` already converts a
  rejected judge into an error per rule. The first pass is wrapped the same
  way: a rejection falls through to the judge and does not fail the rule.

## Phases

Each phase leaves the application working. This is a feature behind a key
that defaults to `false`, so per ADR-50 every slice before C3 is a `chore`.

### Phase A — measure before building

- [ ] **A1.** `packages/basal-client` and the `basal` env fragment. The
  client has `decide(state, questions)`, a timeout, a breaker,
  `isBasalConfigured()` and `modelId()`. Nothing calls it yet.
- [ ] **A2.** A labelled set at `apps/web/evals/datasets/guardrail-first-pass/`,
  every row labelled by a person, not by a model:
  - **benign**: ~200 ordinary questions in Polish and English, taken from the
    rag-benchmark and rephrase-quality datasets;
  - **attacks**: ~200 in Polish and English. That is `red-team.yaml`'s
    jailbreaks plus hand-written ones, including messages that claim to be
    benign;
  - **policy**: three sample operator policies, each with ~60 violating and
    ~30 compliant messages, plus one policy written in German, to check that
    the gate skips it;
  - **other languages**: ~30 German and Ukrainian messages for the gate and
    the deferral check.

  The set is split **before anything runs** into a tuning half and a
  holdout half, stratified by category and language. The holdout is not
  opened until A4. Whoever writes the attacks writes both halves, and nobody
  adds an example after seeing a result.
- [ ] **A3.** A script runs the **tuning half** through `runPolicyRules` with
  today's judge and with the first pass, on basal-2.0 4.5B and max, at
  `max_error` of 0.01, 0.02 and 0.05, and picks one configuration. It writes up the results. It must call the package's
  own functions, not a copy of the prompt; see
  [a test box that runs a different path](../lessons/a-test-box-that-runs-a-different-path-is-worse-than-none.md).
  Before the long run, make one real call to each model; see
  [a provider is not configured until something calls it](../lessons/a-provider-package-is-not-configured-until-something-calls-it.md).
  The write-up reports:
  - the share of benign messages cleared;
  - **attacks and violations cleared (false clearances), listed one by one**;
  - p50 and p95 latency of the first pass against the judge;
  - the judge's own latency per turn, read from existing traces.
- [ ] **A4.** The chosen configuration, and only that one, runs once on the
  **holdout half**. Go or no-go is recorded in this spec. **Go** needs all of:
  - **a false-clearance rate whose 95 % upper bound is at most 3 %** on the
    holdout's attacks and violations combined. With ~190 such rows that
    means zero misses (rule of three: 3/n). One miss is a no-go, even if
    the tuning half had none;
  - zero false clearances on the tuning half at the chosen `max_error`;
  - ≥ 40 % of benign holdout messages cleared;
  - the judge on the critical path: its p50 adds at least 300 ms to the time
    to first token. If it does not, the turn would not get faster, and only
    cost and data residency are left. That is a no-go for this spec unless
    the user decides those two are reason enough.

  On a go, fix the model size and `BASAL_GUARDRAIL_MAX_ERROR`. On a no-go,
  stop and record why. A1 stays as the client for the reranker spec.

### Phase B — run it locally

- [ ] **B1.** `infra/basal/` (a Dockerfile pinned to the basal version from A4,
  with weights downloaded at start into a volume) and a `basal` profile in
  `docker-compose.yml` with an NVIDIA device reservation. Nothing has
  `depends_on` on it.
- [ ] **B2.** `docs/companion-services.md` gains a basal section: the Compose
  profile on Linux with NVIDIA; native `basal-serve --mode mlx` on macOS,
  where Docker has no GPU; the port; the private-network warning; and the
  model and `max_error` pairing. The `create-ragen-app` README lists
  `BASAL_URL` as optional.
- [ ] **B3.** The setup status shows basal as `not configured`, `up` or `down`,
  as it does for Docling. It reads `isBasalConfigured()` and `/health`.
- [ ] **B4. Optional, not a requirement: a trial on Railway.** Railway has no
  GPU, so this is a CPU trial:
  - basal-serve in `llamacpp` mode, beside a llama.cpp server running the GGUF
    build of basal-2.0-mini or 4.5B (Q8_0);
  - a private-network service in a separate Railway environment, never the
    demo's public one;
  - the A3 set run against it, recording p50/p95.

  It answers one question: is CPU latency under `BASAL_FIRST_PASS_TIMEOUT_MS`
  (300 ms)? If it is, a GPU-less self-hosted install can use the first pass.
  If it is not, every turn would time out into the judge, and we write that
  down. Remember that calibration is per engine port, so GGUF needs its own
  `max_error` from A3, not the GPU number. Nothing in C depends on B4.

### Phase C — the first pass

- [ ] **C1.** In `packages/guardrails`:
  - `basalQuestionFor`, the clearing rule, the language gate and `firstPass`
    on `InputStageDeps`, handed on only by `evaluateInputStage`;
  - unit tests for every row of the rule table above;
  - a test that the output stage and `runPolicyTrial` never receive it;
  - a test that `deps.record` never sees a cleared rule.

  No binding supplies `firstPass` yet, so behaviour is unchanged.
- [ ] **C2.** The `guardrailFirstPass` feature key (default `false`). Both
  bindings (web and api) build the first pass from `@ragenai/basal-client` and
  supply it in `InputStageDeps` when the key is on. The `decidedBy` and
  `basalOutcome` attributes are added. `guardrails-are-not-recopied` is
  extended.
- [ ] **C3.** The admin feature-key screen describes the key as needing a
  running basal. It does **not** read `BASAL_URL` itself: apps/admin's env
  says nothing about web's or api's, so in a split deployment that note would
  be wrong. The real state is B3's status, read from the app that runs the
  rule. `docs/guardrails.md` gains a "First pass" section, and a changelog
  line is added. This is the `feat` that releases it.
- [ ] **C4.** Re-run A3 through the bindings, end to end. The numbers must
  match A3; a mismatch means a binding asks a different question.

## Testing

- **Unit** (`packages/guardrails`):
  - every row of the clearing rule: cleared, suspected, deferred, timeout,
    error, rejected, the other side of the threshold;
  - the language gate: `pol`, `eng`, `und`, other languages;
  - the client: the breaker, timeout, a 422 and a malformed body.
- **Unit** (`packages/basal-client`): it parses a `noul` answer, treats
  `deferred` as deferred, and reads the model id.
- **Unit** (bindings): each binding passes `firstPass` only when the key is on
  and basal is configured. Under the testing rules, a five-line binding still
  gets a test.
- **Architecture**:
  - `guardrails-are-not-recopied` covers `basalQuestionFor`;
  - both bindings pass `firstPass`;
  - nothing outside `packages/basal-client` calls `/v1/systemone`.
- **Measurement**: A3 and C4 are the evidence. CI runs neither, because no CI
  runner has a GPU, so the write-ups live in `apps/web/evals/` beside the
  rag-benchmark results.
- **E2E**: no new spec. The key defaults to `false`, and CI has no basal, so
  `smoke-*`/`p0-*` keep exercising the judge-only path. That is the path every
  installation without basal runs.

## Rollout and rollback

- Default off, twice over: `BASAL_URL` is unset, and `guardrailFirstPass` is
  `false`.
- Enable it per organization after B is running and A4 said go.
- **Rollback:** turn the key off for the organization, or unset `BASAL_URL`
  for the installation. There is no migration, so reverting the PRs is also
  clean.
- A basal upgrade re-runs A3 before `BASAL_GUARDRAIL_MAX_ERROR` changes. Until
  then, the model-id check stops clearing.

## Next (separate specs)

1. **basal in the reranker slot**: a fourth option beside reranker, selection
   and fusion order, measured with rag-benchmark the way D2 of
   [LLM document selection](2026-09-29-llm-document-selection.md) was. It
   reuses `packages/basal-client`.
2. **A sufficiency check before answering**: answer, search again, or say the
   sources conflict. This is a new product behaviour.
3. **Injection detection in retrieved chunks**, using the first-pass logic on
   a different state.
4. **Raising `MAX_ACTIVE_LLM_POLICIES`**, decided on Phase C's numbers.

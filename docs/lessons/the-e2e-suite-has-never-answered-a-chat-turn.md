---
title: 'The e2e suite has never carried a turn through a real chain to an answer, and four separate gaps hide behind that'
modules: ['web', 'ci']
areas: ['testing', 'ci']
topics:
  [
    'e2e',
    'playwright',
    'mock-llm',
    'qdrant',
    'route-table',
    'false-green',
    'model-selector',
  ]
---

# The e2e suite has never answered a chat turn

**Context**: guardrails Phase D4 added `p0-30`, a spec asserting that an
`OUTPUT` rule withholds an answer. It needs an answer to withhold, so it was
the first spec in the suite to require that a real chain complete a turn.

**Problem**: it cannot, and four separate things are in the way. None of them
had ever failed a test, because no test had ever asked.

1. **No Qdrant service.** `e2e.yml` runs Postgres and Redis. A turn that
   reaches the knowledge base dies with `TypeError: fetch failed` inside the
   SSE handler. The workflow's own comment says so — "a turn that reaches the
   knowledge base cannot complete whatever the route table says" — so this was
   known and simply never blocked anything.
2. **No embedding route.** `routes.e2e.yaml` has one entry, `mock-model`, and
   the chain resolves `bge-multilingual-gemma2` for embeddings:
   `UnknownModelError`, four times in the last *green* run on `main`.
3. **The answer model races the organization's setting.** `DEFAULT_MODEL` wins
   only when the model picker is hidden and this suite shows it, so some turns
   resolve `gemini-3-flash-preview`, which has no route. Two of six turns in
   one local run did, and those were exactly the turns with no answer — which
   from the outside looks identical to a guardrail that did not fire.
4. **The rephraser does not speak the mock's shape.** `generateObject` gets
   `{"standalone_question": …}` where the schema wants `standaloneQuestion`,
   spends its retries, and falls back. Tolerated, but it is most of the
   fifteen seconds a turn costs.

What kept all of this invisible: `p0-23` and `p0-24` route the threads
endpoint to a canned SSE response, and `p0-27` and `p0-29` assert a refusal or
an absence. **Every one of those passes on a turn that never answers.**

**Rule**: a suite that never asserts the happy path can be green while the
happy path has not worked for months. When adding the first assertion of a
kind, expect to pay for everything that assertion is the first to touch — and
check whether it is the first, because that changes the estimate from "write a
spec" to "make the harness able to run one".

Three traps met while proving it, each worth more than the fix:

- **A local e2e run without `LLM_ROUTES_PATH`, `LLM_MOCK_BASE_URL` and
  `LLM_MOCK_API_KEY` talks to real providers.** The answers come back in
  Polish, nothing matches the mock's sentence, and the run is worthless as
  evidence about CI. `ragen-e2e-triage` says a baseline is only evidence if
  the baseline is set up correctly; this is that rule applied to the model
  path rather than to the build.
- **A database assertion must be scoped to the turn's own thread.** Reading
  "the newest assistant message" passed on a Playwright retry **in 1.4
  seconds** — it was reading the row the failed attempt had written. The suite
  shares one database and does not truncate between specs.
- **An assertion that the withheld text is nowhere on screen cannot be written
  over the matched token**: the token is in the question the reader typed, so
  it is legitimately on the page three times. Assert on something only an
  answer contains.

**Applies to**: `apps/web/e2e/`, `.github/workflows/e2e.yml`, and any future
spec that needs a chat turn to produce an answer rather than a refusal.

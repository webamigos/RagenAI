---
title: "A guardrail evaluated concurrently with a model call loses two races: the refused text still reaches the model, and an unrelated failure reports itself as the refusal"
modules: ['web', 'api']
areas: ['testing', 'architecture']
topics: ['guardrails', 'promise-all', 'error-propagation', 'e2e', 'playwright', 'llm-gateway', 'route-table', 'false-red']
---

# A guard racing a model call reports the wrong failure

**Context**: Phase B of the guardrails programme. `p0-29` asserts that a
question matching an enabled `BLOCK` rule is refused with a localized message
and produces no answer. It passed locally and failed in CI on every retry, for
two days running, against two different fixes.

The first fix was the [60 s cache
one](three-shapes-of-a-test-that-guards-nothing.md): rules created in
`beforeAll` were invisible to a server that had already served a hundred specs,
so the fixtures moved into the seed. That diagnosis was correct and the fix was
right. The spec still failed identically, which is the part worth recording —
a correct fix for a real cause is not evidence that it was *the* cause.

**Problem**. The failing assertion waited twenty seconds for the refusal text
and found nothing. The trace's SSE body said why:

```
event: error
data: {"type":"error","message":"An unexpected chain error occurred","code":"unknown-error"}
```

`"An unexpected chain error occurred"` is `UnknownChainError`'s default. A
`GuardrailError` could never produce it: `SseExceptionFilter` preserves the
code of anything that is a `ChainError`. So whatever reached the filter was
not one, and the client rendered `t('unknown-error')` — a toast the spec was
not looking for, in a suite where no other chat test looks at a real turn
because they all mock the stream.

Two independent causes, either of which alone was enough:

1. **No route for the models the chain resolves.** `routes.e2e.yaml` defines a
   single entry, `mock-model`. The rephraser defaults to
   `REPHRASE_MODEL || 'gemini-2.5-flash'` and the organization's answer model
   came from the shipping default `gemini-3-flash-preview`, because the seed
   set none and `getModel` prefers the stored value whenever the model
   selector is enabled — which this suite enables, so `DEFAULT_MODEL` never
   applied. `resolveModel` threw `UnknownModelError`, a plain `Error`.

2. **The chain ran the guardrail stage beside the rephraser.** `basic-rag`
   used `Promise.all([evaluateGuardrails(), rephraseAndExpand(...)])` whenever
   no rule rewrote the text, on the reasoning that a verdict does not change
   what moves on. `Promise.all` rejects with whichever settles first, so the
   rephraser's failure reached the reader and the refusal never rendered.

The second one is a defect in the product, not in the test. When the routes
*do* resolve, running the two concurrently means a question a `BLOCK` rule
refuses has already been sent to the rephraser — an external provider on most
installations — by the time the refusal is decided. "Blocked" then describes
what the reader saw, not where the text went. The spec's own comment claimed
the turn "was refused before the chain reached a model" and offered the
absence of the mock answer as proof; the rephraser is a model too, and leaves
nothing in a transcript for an e2e assertion to find.

Three green things pointed away from all of this. The fixture guard —
`a BLOCK rule and a LOG rule are enabled` — passed, correctly, every time: the
rules really were seeded and enabled. The `LOG` test and the ordinary-turn
control passed too, because both assert only the *absence* of the refusal
text, which is equally true of a chain that evaluates no rules at all and of
one that errors before it gets there.

**Rule**.

- **A guard that decides whether something may proceed runs before it, not
  beside it.** Concurrency between a check and the thing it checks is a
  correctness question, not a latency one: it decides both whether the guarded
  side effect happens anyway and which of the two failures the caller sees.
- **When a guard is green and the thing it guards is red, the guard is
  answering a different question.** Read what it actually asserts before
  concluding the fault is downstream of it.
- **An absence assertion needs a presence assertion beside it.** `no refusal
  appeared` cannot distinguish "the rule allowed it" from "no rule ran". The
  `LOG` test now also polls for the `GUARDRAIL_FLAGGED` row the rule writes.
- **Read the wire before theorising.** The SSE body named the error class in
  one line, after two days of reasoning about cache windows. Playwright keeps
  it: `gh run download <id> --name playwright-report`, then the trace zip's
  `*-trace.network` and `resources/`.
- **Every model an e2e chain resolves needs a route, and the org fixture has
  to name one.** There are three — answer, rephrase, embeddings — and the
  environment variable for the first is read only when the model selector is
  hidden.

**Applies to**: `apps/web/src/libs/chains`, `apps/api/src/chains`, anything
evaluating a policy beside the work it governs, and the e2e route table in
`apps/web/e2e/routes.e2e.yaml`.

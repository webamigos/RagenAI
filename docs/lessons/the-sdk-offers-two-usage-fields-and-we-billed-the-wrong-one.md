---
title: 'The AI SDK offers two token-usage fields, both typecheck, and we aggregated the smaller one into the billing ceilings'
modules: ['web', 'api']
areas: ['architecture', 'observability']
topics: ['ai-sdk', 'token-usage', 'usage-limits', 'tool-calling', 'billing', 'silent-failure', 'architecture-tests']
---

# The AI SDK offers two token-usage fields, both typecheck, and we aggregated the smaller one into the billing ceilings

**Context**: found while scoping the AI SDK 6 → 7 upgrade (B0c of the LiteLLM
retirement). The upgrade's migration guide mentions in passing that `usage`
changes meaning in 7.0, which prompted the question of what it meant in 6.

**Problem**: the SDK's own type declarations say it in one line each.

```ts
/** The token usage of the last step. */
readonly usage: LanguageModelUsage;
/** The total token usage of all steps. */
readonly totalUsage: LanguageModelUsage;
```

All three chat chains — `apps/web`'s basic-rag and conversation chains and
`apps/api`'s basic-rag chain — passed `stopWhen: stepCountIs(MAX_TOOL_STEPS)`
and read `usage`. `MAX_TOOL_STEPS` is 10. `totalUsage` appeared nowhere in the
repository.

So on any turn where an MCP tool ran, only the **final** step's tokens were
recorded. Everything the model spent deciding to call the tool, and every
round-trip after it, was dropped before the `AiUsage` row was written — and
therefore before `checkUsageLimitsQuery` aggregated those rows into the monthly
**cost and token** ceilings. Phase A had just made those ceilings enforceable
for the first time; they were enforcing a number that was too small by however
much the tools cost.

The **message** ceiling was unaffected, and the reason is worth stating because
it is not symmetry: that limit is a `count()` of `CHAT_COMPLETION` rows, not a
`_sum` of anything. A tool-calling turn writes one row whichever usage field
populates it, so only the token and cost values inside the row were wrong. Cost
and tokens are `_sum: { totalTokens, estimatedCost }`; the message count reads
no token at all.

Nothing could see it. Both fields sit on the same result object, both are
`LanguageModelUsage`, and both typecheck. Every test asserted on a single-step
call, where the two are equal by definition.

**Why the upgrade would have hidden it.** AI SDK 7 redefines `usage` to span all
steps, so the bump alone would have corrected the numbers — recorded usage
would jump for tool-using organizations, an organization near its ceiling might
start being refused, and the cause would be buried inside a four-package version
bump. Fixed first, on the old version, so the change in billed numbers is
attributable to a deliberate one-line fix rather than to a dependency update.

**Rule**: when an API offers two fields whose names differ by a qualifier and
whose types are identical, the type system has abstained — the choice is
documentation, and it has to be checked by something. Here that is
`tests/architecture/multi-step-calls-count-every-step.test.ts`, which asserts the
_combination_: any call site passing `stopWhen` must read `totalUsage`.
A comment could not have held this, because `usage` is correct in the several
single-step calls in this repo (rephrase, the worker's summaries and scoring)
and wrong only beside a `stopWhen`.

**Applies to**: every `generateText`/`streamText` call that can take more than
one step. Re-check after AI SDK 7 lands, where the field to read is `usage`
again and `finalStep.usage` is the last-step value — the guard's rule inverts
with the major version, which is itself worth a moment's care.

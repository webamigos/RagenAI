---
title: Moving enforcement into a dependency left the old query behind, and six months later it read as proof the app still enforced the limit
modules: [web, api, admin]
areas: [architecture, security]
topics: [usage-limits, dead-code, litellm, budgets, refactoring, false-green, silent-failure, adr-34]
---

## Context

`OrganizationSettings` carries four ceilings — `monthlyTokenLimit`,
`monthlyCostLimitCents`, `monthlyMessageLimit`, `monthlyApiRequestLimit`. The
admin panel collects all four
([limits/OrgLimitsForm.tsx](<../../apps/admin/src/app/(dashboard)/limits/OrgLimitsForm.tsx>)),
`defaults/propagation.ts` pushes them to new organizations, and the
organization page displays them.

`checkUsageLimitsQuery` computes the first three against `AiUsage` and returns
`isAnyLimitExceeded`. It was wired up when the feature landed in `fc6142c44`
(2026-03-07), at three call sites: `assistant-stream.ts` (panel chat), the
public API's `api-messages.command.ts`, and the AI-usage settings action.

## Problem

**Nothing calls it.** The only two references in the repository today are its
own definition and a comment in `apps/admin/src/lib/litellm.ts` asserting that
"the database is the source of truth and the app enforces cost limits itself in
`check-usage-limits-query`".

It was disconnected in two steps, neither of which looks like a removal:

- `e3d569947` (2026-03-14, "feat: security audit") **deleted the whole file**
  `api/v1/__logic__/commands/api-messages.command.ts` during a rewrite. Two
  call sites went with it as collateral.
- `c35a3b4aa` (2026-03-22, "feat: new usage tracking") removed the `if` block
  from `assistant-stream.ts` — in the same hunk that introduced
  `getLiteLLMOrgApiKey`. That one was **deliberate**: enforcement moved to
  LiteLLM's virtual-key budget, which returns a 4xx the app recognises by
  matching the substring `'Budget has been exceeded'`
  ([budget-error.ts](../../apps/web/src/app/api/chatbot/[token]/chat/budget-error.ts)).

Two things survived the handover that should not have. The query file, with no
test and no caller. And the belief: five months later, [ADR-34](../adrs/34-shared-litellm-client-package.md)
and the comment above cited the leftover file as evidence the application
enforces its own limits, and used it to justify treating the proxy writes as
best-effort. The evidence was a function nobody had called since March.

The handover was also **narrower than the thing it replaced**, and nothing
recorded the gap. `syncOrgCostLimitToLiteLLM` maps exactly one field —
`monthlyCostLimitCents / 100` → `max_budget`. So:

| Ceiling                  | Collected in the panel | Enforced by                                         |
| ------------------------ | ---------------------- | --------------------------------------------------- |
| `monthlyCostLimitCents`  | yes                    | LiteLLM's virtual-key budget, via a substring match |
| `monthlyTokenLimit`      | yes                    | **nothing**                                         |
| `monthlyMessageLimit`    | yes                    | **nothing**                                         |
| `monthlyApiRequestLimit` | yes                    | `checkApiRequestLimit`, public API path only        |

Every static check is green on all of it. Typecheck sees an exported function.
Lint scopes unused-variable checks to a file. Coverage covers a file with no
test at all by not reporting it as a failure. And the feature _appears_ to work
end to end, because the one ceiling anyone actually tests — cost — is caught by
a dependency.

## Rule

**When enforcement moves into a dependency, delete the code it replaced in the
same commit, and write down what the new owner does not cover.** A query left
behind is not harmless dead code: it is the most convincing possible evidence
that the check still exists, and it will be read that way by the next person —
including by an ADR.

Three checks that would each have caught this:

- After removing a call site, grep for the callee's remaining callers. Zero
  callers means the file goes too, not that it is "still available".
- When a control moves to an external system, enumerate the fields it accepts
  against the fields you were enforcing. `max_budget` is one of three; the
  other two became decoration on a form.
- Before citing an existing function as a guarantee — in a comment, an ADR or a
  spec — grep for its callers. `apps/admin/src/lib/litellm.ts` states a
  property of the system that has not been true since two commits after the
  feature shipped.

A limit that is computed is not a limit. A limit is a call site.

## Applies to

Anything where a policy is expressed as a query or predicate rather than a
guard on the path it protects — usage ceilings, quota checks,
`isEncryptionConfigured()`-shaped predicates, feature gates. Same blind spot as
[a feature merged into a component nothing renders](a-feature-merged-into-a-component-nothing-renders.md)
and [a CSS hook with no consumers](a-css-hook-with-no-consumers-was-never-a-working-hook.md):
the missing thing is an edge, and typecheck, lint and coverage all look at
nodes.

The fix is Phase A of
[2026-09-14-replace-litellm-with-an-in-process-gateway](../specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md),
which re-enforces all three ceilings in the application before the provider
call.

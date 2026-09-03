---
title: 'A constant duplicated across workspaces drifts silently, and typecheck cannot see it because each copy derives its own type'
modules: ['web', 'api', 'admin']
areas: ['architecture', 'testing']
topics: ['monorepo', 'feature-flags', 'type-safety', 'architecture-tests']
---

# A constant duplicated across workspaces drifts silently, and typecheck cannot see it because each copy derives its own type

**Context**: adding a feature flag (`voiceInput`) meant adding a key to `FEATURE_KEYS`. AGENTS.md and the `apps/api` port comment both described the list as living in three places — `apps/web/src/features/subscriptions/contracts/features.types.ts` (the contract), `apps/api/src/subscriptions/types.ts` (the port, per ADR-21), and `apps/admin/src/app/(dashboard)/features/feature-keys.ts` (the UI that writes per-org overrides). Each derives its own union with `type FeatureKey = (typeof FEATURE_KEYS)[number]`.

**Problem**: two separate failures, and neither is the kind a reviewer catches by reading a diff.

First, **there were four copies, not the three that were documented** — `apps/admin/src/app/(dashboard)/features/plans/PlanFeaturesDialog.tsx` (then under `subscriptions/`) kept its own `LABELS: Record<FeatureKey, string>`, byte-identical to the one in `OrgFeaturesForm.tsx` twenty lines away in a sibling file. It surfaced only because `Record<FeatureKey, string>` is exhaustive, so adding a key made *that one* fail typecheck. A list-shaped duplicate (`FEATURE_KEYS` itself) would not have.

Second, and worse, **typecheck is structurally blind to the drift between the arrays**. Because every workspace derives `FeatureKey` from its own array, all three stay internally consistent while disagreeing with each other. Every copy then fails differently and silently:

- missing in `apps/api` → the NestJS gate for that flag reads `undefined`, and the feature stops being enforced on the public API path while remaining enforced in-app;
- missing in `apps/admin` → the key never renders a control, so no platform admin can turn the feature on for anyone, and the feature is simply dead;
- missing in `apps/web` → nothing gates the in-app surface.

A security gate that silently stops gating on one of three paths is the worst of those, and lint, typecheck, unit tests and migrations all pass.

**Rule**: when a constant is hand-copied across workspaces because there is no shared package for it, add an architecture test comparing the copies — do not rely on a comment saying "keep these in sync", and do not assume typecheck helps. Two such tests once existed — `feature-keys-agree.test.ts` and `tenant-scope-guards-agree.test.ts` — comparing the key sets and the two tenant-scope guards. **Both are gone**, because ADR-33 removed the duplication they guarded; `tests/architecture/shared-contracts-are-not-recopied.test.ts` replaced them. Read them in git history for the pattern, not in the tree. Two details worth copying from both: assert that the parse produced *something* (a reformat that stops matching the regex would otherwise leave the comparison passing while testing nothing), and verify the test by mutation before trusting it.

Prefer collapsing the duplicate outright where the workspace boundary does not force it — the two `admin` label maps became one import from `feature-keys.ts`, which makes exhaustive `Record<FeatureKey, string>` typing the reminder instead of a test. The workspace boundary rarely forces it: `apps/admin` already reaches into `apps/web` by relative path for the generated Prisma client, so a dependency-free module can be imported the same way rather than copied.

## The same failure, worse: a copy that drifted in *namespace*, not just membership

`apps/admin/src/app/(dashboard)/models/models-config.ts` listed the models a platform administrator may put on an organization's allowlist. It was a fourth hand-written list, and it had drifted past membership into spelling:

| admin offered | what LiteLLM actually serves |
|---|---|
| `openai/gpt-5.3-chat` | `gpt-5.3-chat` (and it was commented out of `config.yaml`) |
| `openai/gpt-5.2`, `openai/gpt-5.2-chat` | *did not exist anywhere* |
| `anthropic/claude-sonnet-4.6` | `claude-sonnet-4-6` |
| `google/gemini-3-flash-preview` | `gemini-3-flash-preview` |
| — | `gpt-5.4` (the documented chat default), `gpt-oss-120b`, `mistral-small-3.2` — **not offerable at all** |

Every value carried a provider prefix that LiteLLM model IDs do not have, and two used dots where the ID uses dashes. The consuming code is a membership test:

```ts
// apps/web/src/app/lib/actions/checkAvailableProviders.ts
if (allowedModels.length > 0) {
  models = models.filter((model) => allowedModels.includes(model.value));
}
```

`model.value` is LiteLLM's own `id`. So a value that matches nothing does not *narrow* the list — it **empties** it. Restricting an organization to "GPT-5.3 Chat" from the admin panel left that organization with no selectable model at all, and the same non-existent IDs were then POSTed to LiteLLM's `/team/update`, whose response the caller discards.

Note how much less visible this is than a missing key. A missing key at least fails loudly the moment someone looks for the control. A wrong-namespace value renders a perfectly normal-looking checkbox, saves without error, and breaks a *different* app.

**Rule**: an identifier that another system owns — a LiteLLM model ID, a provider enum, a Stripe price — must be derived from that system's own catalogue, never retyped. The fix was to delete the list and build it from `apps/web/src/libs/llm/model-registry.ts`, the module `fetchLiteLLMModels()` already labels `/v1/models` with, filtered to `visible: true`. Then validate on write the way the connectors action already did, so an unknown value is rejected rather than silently stored.

## How it was resolved

All four duplicates are gone. `packages/platform-contracts` (ADR-33) now holds the LLM catalogue, the feature flags, the MCP connector metadata and the tenant-scope model map; each app keeps a re-export or a thin binding, so no import site changed.

The two architecture tests that compared the copies — `feature-keys-agree.test.ts` and `tenant-scope-guards-agree.test.ts` — are deleted, because there are no copies left to compare. `tests/architecture/shared-contracts-are-not-recopied.test.ts` replaces them and enforces the invariant that actually matters now: **these contracts are declared in exactly one place.** Both deleted tests failed loudly and correctly when their subjects disappeared, including the "do not delete it" message they carry. That message is right in general; a change that removes the duplication is the exception it was written to make someone stop and think about.

Two things got *stronger* than the tests they replaced:

- The package's tests check each contract against its **real** source of truth rather than against another copy — connectors and the tenant map against `prisma/schema.prisma`, the catalogue against `infra/litellm/config.yaml`. Two hand-written lists can agree and both be wrong; a list and its source cannot.
- `apps/web`'s connector binding assigns the shared map into a `Record<McpConnectorProvider, string>` typed by its own generated Prisma enum, so a provider missing from the package is now a **compile error** — a guarantee neither copy had.

**Rule going forward**: a value two apps must resolve identically belongs in `packages/platform-contracts`, not in each app with a comment asking the next reader to keep it in sync. What stays out of the package is anything a deployment configures (which models LiteLLM actually serves is read from `/v1/models` at runtime, not from the package) and anything needing a generated Prisma client (`Prisma.defineExtension` must be bound per app).

**Applies to**: any value hand-maintained in more than one workspace, and any identifier owned by an external system. The four named above are now shared. Still duplicated, and the obvious next candidates: `ai-pricing.ts` (web, api) and `organizations/types.ts` (see `apps/api/docs/ported-libs.md`).

---
title: 'A constant duplicated across workspaces drifts silently, and typecheck cannot see it because each copy derives its own type'
modules: ['web', 'api', 'admin']
areas: ['architecture', 'testing']
topics: ['monorepo', 'feature-flags', 'type-safety', 'architecture-tests']
---

# A constant duplicated across workspaces drifts silently, and typecheck cannot see it because each copy derives its own type

**Context**: adding a feature flag (`voiceInput`) meant adding a key to `FEATURE_KEYS`. AGENTS.md and the `apps/api` port comment both described the list as living in three places — `apps/web/src/features/subscriptions/contracts/features.types.ts` (the contract), `apps/api/src/subscriptions/types.ts` (the port, per ADR-21), and `apps/admin/src/app/(dashboard)/features/feature-keys.ts` (the UI that writes per-org overrides). Each derives its own union with `type FeatureKey = (typeof FEATURE_KEYS)[number]`.

**Problem**: two separate failures, and neither is the kind a reviewer catches by reading a diff.

First, **there were four copies, not the three that were documented** — `apps/admin/src/app/(dashboard)/subscriptions/plans/PlanFeaturesDialog.tsx` kept its own `LABELS: Record<FeatureKey, string>`, byte-identical to the one in `OrgFeaturesForm.tsx` twenty lines away in a sibling file. It surfaced only because `Record<FeatureKey, string>` is exhaustive, so adding a key made *that one* fail typecheck. A list-shaped duplicate (`FEATURE_KEYS` itself) would not have.

Second, and worse, **typecheck is structurally blind to the drift between the arrays**. Because every workspace derives `FeatureKey` from its own array, all three stay internally consistent while disagreeing with each other. Every copy then fails differently and silently:

- missing in `apps/api` → the NestJS gate for that flag reads `undefined`, and the feature stops being enforced on the public API path while remaining enforced in-app;
- missing in `apps/admin` → the key never renders a control, so no platform admin can turn the feature on for anyone, and the feature is simply dead;
- missing in `apps/web` → nothing gates the in-app surface.

A security gate that silently stops gating on one of three paths is the worst of those, and lint, typecheck, unit tests and migrations all pass.

**Rule**: when a constant is hand-copied across workspaces because there is no shared package for it, add an architecture test comparing the copies — do not rely on a comment saying "keep these in sync", and do not assume typecheck helps. `tests/architecture/feature-keys-agree.test.ts` compares the key sets and the web/api `DEFAULT_FEATURES` values; `tests/architecture/tenant-scope-guards-agree.test.ts` is the same pattern for the two tenant-scope guards. Two details worth copying from both: assert that the parse produced *something* (a reformat that stops matching the regex would otherwise leave the comparison passing while testing nothing), and verify the test by mutation before trusting it.

Prefer collapsing the duplicate outright where the workspace boundary does not force it — the two `admin` label maps became one import from `feature-keys.ts`, which makes exhaustive `Record<FeatureKey, string>` typing the reminder instead of a test.

**Applies to**: any value hand-maintained in more than one workspace. Today that is `FEATURE_KEYS`/`DEFAULT_FEATURES` (web, api, admin) and the tenant-scope guard's model list (web, api). A shared package would remove the need; until then, the test is the tripwire.

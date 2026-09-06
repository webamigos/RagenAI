---
title: 'Flipping a feature default to opt-in broke six e2e specs, and the tier they live in never runs on a PR'
modules: ['web', 'api']
areas: ['testing']
topics: ['feature-flags', 'e2e', 'playwright', 'test-tiers', 'seed-data', 'fail-late']
---

# Flipping a feature default to opt-in broke six e2e specs, and the tier they live in never runs on a PR

**Context**: two PRs made external sharing opt-in per organization — #854 for `publicChatbot` (the hosted public assistant page and the embed widget) and #853 for `publicThreadLinks` (public thread links). Both set the code default to `false` in `packages/platform-contracts/src/features/features.ts`, so an organization gets the feature only once a platform admin grants it. Both were correct changes, well-reasoned in their own comments.

Neither touched `apps/web/e2e/seed/e2e-seed.ts`, which had been creating its `organizationSettings` rows with no `featureOverrides` since long before the flags existed.

**Problem**: six tests went red and stayed red. `getEffectiveFeatures()` resolves **org override > plan > code default**; the seeded org had no override, and the `Trial` plan the seed creates carries no `features` value, so both flags fell through to `false`.

- `p1-32-public-shared-access` (3 tests) — `generateProjectKey` throws `UnauthorizedException` before minting a token. Worse, the web caller catches everything into the generic `'Failed to generate access token'`, so the browser-side symptom was a dialog whose link input never appeared, with no hint that a feature gate was responsible.
- `p1-34-public-thread-share` (3 tests) — the `thread-public-share-btn` button is gated on the flag, so it never renders and every test in the file times out in its shared `openShareDialog` helper.

The reason nobody noticed: **both specs are `p1`**. Per `AGENTS.md`, a PR runs only `smoke-*` and `p0-*`. `p1`–`p3` run on push to `main` and nightly. So each PR was green on the check that gates it, went in, and turned the post-merge run red — where a red build is somebody's problem in general and nobody's in particular. The two failures then sat on top of each other, each making the other look like pre-existing noise.

Diagnosis was slower than it should have been because a plausible wrong answer was sitting right there: `ragen-token-vault` on `:3100` was returning `{"status":"unhealthy"}` on the same machine, and "share link cannot be minted" reads exactly like a vault problem. It was unrelated. The 500s came from the feature gate; the vault was a separate local nuisance.

**Rule**: flipping a feature's default from on to off is a change to every consumer that assumed the old default — and test fixtures are consumers. When you change a value in `DEFAULT_FEATURES`, grep the e2e seeds and fixtures for anything that exercises the surface it gates, in the same PR. Type the seed's overrides against `FeatureOverrides` so renaming a flag at least breaks `typecheck` rather than silently reverting a spec to red.

**Rule for tiering**: `p1`–`p3` is not "important but slower" — it is "will not stop the change that breaks it". Anything that must block a merge belongs in `smoke-*` or `p0-*`. When a change lands that a `p1` spec covers, run that spec locally; the PR check will not do it for you:

```bash
npm run test:e2e --workspace=@webamigos/ragen-web -- "p1-3(2|4)-"
```

**Rule for the seed**: keep one fixture honest about the shipping defaults. The e2e seed's second organization deliberately has no `featureOverrides`, so it resolves every flag the way a real organization does on day one. Grant overrides to the primary org only, and only for what a spec actually needs.

**Applies to**: any change to `DEFAULT_FEATURES` or to plan `features`; any new `useOrgFeature`/`isFeatureEnabled` gate placed in front of a surface that an existing spec drives.

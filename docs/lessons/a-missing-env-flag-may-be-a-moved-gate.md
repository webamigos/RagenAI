---
title: 'A documented env flag that grep cannot find is not proof the gate was lost — check whether it became a per-org setting'
modules: ['web', 'api', 'worker']
areas: ['architecture', 'documentation']
topics: ['feature-flags', 'rag', 'organization-settings', 'docs-drift']
---

# A documented env flag that grep cannot find is not proof the gate was lost — check whether it became a per-org setting

**Context**: `docs/rag-pipeline.md`, `AGENTS.md`, `.env.example`, the LiteLLM doc,
the self-hosting page and the bug-report template all listed
`FEATURE_FLAG_MULTI_QUERY` as a runtime flag defaulting to on. Grepping
`apps/web/src` found no such variable — only `FEATURE_FLAG_BUILT_IN_TOOLS`,
`FEATURE_FLAG_PII_MASKING` and `FEATURE_FLAG_RERANKING`. Two readings fit that
evidence: the flag was removed on purpose and the docs kept it, or the gate was
dropped in a refactor and multi-query is now unconditional. Those call for
opposite fixes — a docs edit versus restoring a lost gate — so the difference
had to be settled before touching anything.

**Problem**: the flag had been *replaced*, not removed. Commit `59bf4a2b`
("feat: organization rag settings") deleted `isMultiQueryEnabled()` and put
`config?.ragSettings?.multiQueryEnabled ?? true` in its place, backed by a
nullable `organization_settings.multi_query_enabled` column defaulting to `true`
via `defaultRagPipelineSettings`. The gate was never lost — it moved from an env
var to a database column, and every doc that named the env var went stale in the
same commit. `git log -S'FEATURE_FLAG_MULTI_QUERY' -- apps/web/src src` shows
this in one command; the removal is in a *feature* commit, not a refactor, which
is exactly why nobody re-read the docs.

The same investigation turned up two more drifts of the same shape:
`MULTI_QUERY_VARIANT_COUNT` was cut from 2 to 1 in a "rag pipeline speedup"
commit (two queries per turn, not three — and the rephrase and expansion merged
into one `generateObject()` call), and reranking became **opt-in** behind
`FEATURE_FLAG_RERANKING=1` on the very day ADR-12 was accepted, hours after the
ADR wrote "no additional env var to enable/disable". Docs kept saying "all four
improvements default to on" for months while one of the four was off on every
default install.

**Rule**: when a documented flag has no reader in the code, run
`git log -S'<FLAG>' -- <src dirs>` before concluding anything. A flag that
disappears in a *feature* commit was usually converted to a setting; one that
disappears in a refactor may genuinely be a lost gate. Say which of the two you
found in the commit message and in whatever doc you fix — the next reader gets
the same two readings from the same grep. And when you move a gate from env to
database, treat the env var's documentation as part of the blast radius: grep the
repo for its name, not just the app.

**Corollary for "defaults to on" claims**: a stage guarded by
`FLAG === '1' && !!CREDENTIAL` is off on a default install, however loudly the
prose says otherwise. Read the enable-check, not the ADR that introduced the
stage — ADR-12's own configuration table was falsified the day it landed.

**Applies to**: any feature flag in this repo, and especially the RAG pipeline,
where four stages are gated four different ways (unconditional, per-org setting,
worker env flag, opt-in env flag plus credentials). `docs/rag-pipeline.md` now
lists which is which.

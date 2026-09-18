# A permission filter on a payload field nothing writes matches nothing — and only the surface that resolves the caller's scope still answers

**Area:** architecture, rag, testing · **Module:** api, worker, web ·
**Topic:** qdrant, metadata-filter, access-control, accessible_by, retrieval,
silent-failure, adr-21

## What happened

Testing the public API against a freshly ingested corpus, `/v1/search` returned
the right document for every query and `/v1/chat/completions` returned nothing
at all — same API key, same organisation, same question, same Qdrant
collection. The chat prompt's `<project_knowledge>` element was empty, and the
answer was whatever the model made up from the instructions around it.

Two independent gaps produced it, and either one alone would have been
invisible.

**The chat surfaces never resolve the caller's membership scope.**
`chat-completions.service.ts` calls `initializeRagChain({ orgId, userId,
projectId, … })` and passes no `scope` and no `userTeamIds`, so
`initializeRagChain`'s own default applies: `scope = 'member'`. At anything
other than `organization` scope, `buildMetadataFilter` adds a
`metadata.accessible_by` condition. `search.service.ts` — the same retrieval,
the same builder — does resolve it, via `this.folders.getMembershipContext(…)`,
and the comment above that call names this exact failure in advance. One
surface was fixed; the sibling was not.

**Nothing writes `metadata.accessible_by` at ingest.** The worker's
`ensureCollection` creates a payload _index_ on the field, which reads like the
field is populated. The only code that writes a _value_ is apps/web's
`sync-vector-permissions-command` (on a permission change) and the one-time
`backfill-accessible-by` script. A file uploaded through apps/api's
`POST /v1/files` goes through neither.

So the filter asked for a field that did not exist on any point, matched
nothing, and retrieval returned an empty set — which the chain renders as an
empty context rather than an error.

## Why it stayed hidden

- An index on a field looks like evidence the field is used. It is not: Qdrant
  will happily index a key no point carries.
- A filter that matches nothing and a filter that correctly excludes everything
  are the same observation. Retrieval "working" means returning the right rows,
  not returning without throwing — and an empty result is a perfectly normal
  RAG outcome, so nothing logged, warned or failed.
- A permission condition that matches nothing is _also_ not a permission check.
  The same bug makes the access filter vacuous in both directions.
- `apps/api` holds a ported copy of apps/web's pipeline (ADR-21). The port
  copied the retrieval, not the permission sync that the original depends on.

## What to do

- When two surfaces share a retrieval builder, diff their call sites, not the
  builder. The divergence here is a missing argument, so both compile and both
  typecheck.
- Before trusting a metadata filter, scroll one point and read its payload. If
  a key the filter names is absent, the filter is decorative.
- A test that a document is retrievable has to go through the surface users
  use. `/v1/search` passing said nothing about `/v1/chat`.
- If you add a principal-based condition, add an architecture test that every
  write path which creates points also writes the principal — this is exactly
  the kind of rule `tests/architecture/` exists for.

Found by `scripts/test-env/`; detail in
[`docs/test-reports/2026-09-18-api-mcp-sdk-offline.md`](../test-reports/2026-09-18-api-mcp-sdk-offline.md).

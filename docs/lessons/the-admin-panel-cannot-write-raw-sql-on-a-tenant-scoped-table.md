---
title: 'The admin panel cannot write raw SQL on a tenant-scoped table, because the guard that covers it has no way to say "platform-wide on purpose"'
modules: ['admin', 'guardrails']
areas: ['architecture', 'security', 'testing']
topics:
  ['architecture-tests', 'tenant-scope', 'raw-sql', 'prisma', 'json-columns', 'adr-35']
---

# The admin panel cannot write raw SQL on a tenant-scoped table, because the guard that covers it has no way to say "platform-wide on purpose"

**Context**: guardrails E1 adds a 7-day hit count per rule to `/guardrails` in
`apps/admin`. The counts live in `security_events`, and the grouping key is
inside a JSON column — `metadata->>'guardrail'` holds the rule's `publicId`.
Prisma's `groupBy` cannot group by a JSON path, so the obvious statement is one
`$queryRaw` that groups every rule in a single scan. It was written, and it
worked against the real database on the first try.

**Problem**: `tests/architecture/raw-sql-carries-its-org-filter.test.ts` failed
it. `SecurityEvent` is a tenant-scoped model, the guard requires every raw
statement touching such a table to name `organization_id` in its row-selection
clause, and it scans `apps/admin/src` alongside web, api and worker. The reason
is sound: the tenant-scope extension inspects a Prisma `where` object and sees
nothing at all inside a tagged template, so for raw SQL this build-time check is
the only thing standing there.

But `apps/admin` is the platform-wide surface by
[ADR-35](../adrs/35-two-admin-surfaces-split-by-scope.md). A page whose whole
job is to report across every organization cannot satisfy a rule that every
statement must restrict to one. There is no allowlist and no opt-out marker, so
the only ways forward were to put a hole in a security guard for a count on an
admin page, or not to use raw SQL.

A second guard fired on the same change and is worth knowing about together
with the first. `guardrails-are-not-recopied.test.ts` forbids any app file from
containing `GUARDRAIL_BLOCKED` or `GUARDRAIL_FLAGGED`, so that no runtime can
decide which event a hit is filed under. It matches **source text**, which means
an imported constant *named* `GUARDRAIL_BLOCKED_EVENT` fails it exactly as the
literal would — even though the value comes from `@ragenai/guardrails` and the
app decides nothing. Narrowing the pattern to quoted strings is the obvious
repair and is the wrong one: that test's own comment cites
[three shapes of a test that guards nothing](three-shapes-of-a-test-that-guards-nothing.md)
against precisely that move. The names gave instead — `BLOCKED_HIT_EVENT` and
`FLAGGED_HIT_EVENT` in the package.

**Rule**: in `apps/admin`, treat raw SQL on a tenant-scoped table as
unavailable, and reach for a per-row Prisma query instead — for a JSON key, a
`metadata: { path: [...], equals: ... }` filter per entity, run concurrently.
It is more queries than the grouped statement, and it stays inside the layer
the guards assume. Before weakening an architecture guard to land a feature,
check whether the feature has a shape that does not need it; and when a
text-matching guard fires on an identifier rather than a value, change the
identifier — the guard being broader than its stated rationale is deliberate.

**Applies to**: any aggregate, grouped or JSON-keyed read in `apps/admin` over
a model in `TENANT_SCOPED_MODELS`, and any app-side code that needs to *read*
a vocabulary a guard forbids it to *spell*.

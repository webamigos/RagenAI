---
title: <what this builds, as a noun phrase>
status: draft | approved | in-progress | done | abandoned
areas: [<from the Task Router: rag, auth, knowledge-base, api, worker, admin, …>]
adrs: [<ADRs this relies on or changes, e.g. 14, 31>]
---

# <Title>

## TLDR

Three sentences at most: what this builds, for whom, and the one thing that
makes it non-obvious.

## Open Questions

<!--
Delete this block once every question is answered. While it is here, the spec
is not ready to implement and no code should be written from it.
Only structural questions belong here — ones where a wrong assumption means
rewriting the spec, not ones that can be decided while coding.
-->

- **Q1.** …
- **Q2.** …

## Problem

What is broken or missing today, in terms of what someone cannot do. Include
the evidence — a support case, a metric, a lesson in `docs/lessons.md`.

## Out of scope

What a reader might reasonably assume is included and is not. This section
prevents more rework than any other.

## Proposed solution

The approach, and the alternatives considered with the reason each was rejected.
"We chose X" without "and not Y, because" is not a decision anyone can review.

## Core surfaces touched

Which of the shared surfaces this change reaches, and what protects each one.
See [Core surfaces](../../AGENTS.md). If the answer is "none", say so — that is
the cheap case and worth knowing.

| Surface                | Change | What catches a mistake        |
| ---------------------- | ------ | ----------------------------- |
| `prisma/schema.prisma` | …      | migration + `npm run verify`  |
| `packages/<name>`      | …      | consumers: web / api / worker |
| auth / tenant scoping  | …      | guard tests                   |

## Data model

Schema changes, with the migration and — where data already exists — the
backfill. State what happens to rows written before this change: nothing is
more expensive to discover later.

## Failure modes

What happens when the dependency is down, the input is hostile, the row is
missing, two requests race. One line each; a spec with only a happy path is
half a spec.

## Phases

Each phase leaves the application working.

### Phase A — <name>

- [ ] **A1.** … <!-- testable, and the app still runs afterwards -->
- [ ] **A2.** …

### Phase B — <name>

- [ ] **B1.** …

## Testing

What proves this works, per the Testing Requirements in `AGENTS.md`. Name the
level (unit / integration / e2e) and, for anything that must block a merge, put
it in `smoke-*` or `p0-*` — a `p1`–`p3` e2e test does not gate the PR that
breaks it.

## Rollout and rollback

Feature flag, migration order, and how to undo this if it misbehaves in
production. "Revert the PR" is only an answer when there is no migration.

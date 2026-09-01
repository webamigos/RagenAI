# Lessons

A catalog of non-obvious corrections and gotchas, indexed so an agent (or a human) can check the relevant area before starting nontrivial work in it, instead of re-discovering the same bug. Inspired by `open-mercato`'s `.ai/lessons.md` mechanism.

## How to use this catalog

Before starting a nontrivial task, skim the bullets under the area(s) it touches (not the whole catalog). Each bullet links to a lesson file with four fixed sections: **Context** (what was happening), **Problem** (what went wrong, concretely), **Rule** (the durable takeaway), **Applies to** (scope).

## Adding or updating a lesson

After a nontrivial correction or a non-obvious gotcha (see `AGENTS.md`'s "Post-Task Workflow"):

1. Check whether an existing lesson already covers it — extend that file instead of creating a near-duplicate.
2. Otherwise, add a new file under `docs/lessons/<kebab-case-slug>.md` with the front matter (`title`, `modules`, `areas`, `topics`) and four-section shape shown by any existing lesson.
3. Add one bullet to the relevant `### <area>` section below (create the section if it's a new area).

## Catalog

### architecture

- [Missing organizationId on a findUnique-by-id query is a cross-org IDOR, not just a style nit](lessons/missing-org-scope-on-project-lookup.md) — area:architecture,security; module:projects; topic:data-scoping,access-control

### security

- [A dashboard layout does not protect Server Actions, and a non-existent Better Auth option fails silently](lessons/admin-panel-access-was-session-only.md) — area:security; module:admin; topic:access-control,better-auth,server-actions

### dependencies

- [Absorbing a repo into the monorepo silently re-resolves every dependency it had pinned](lessons/monorepo-absorption-discards-the-lockfile.md) — area:dependencies; module:worker,api; topic:monorepo,npm-workspaces,lockfile,upgrades

### integration

- [A NestJS controller returning a bare string/number/boolean/null serializes wrong](lessons/bare-primitive-response-serialization.md) — area:integration; module:api; topic:api-contracts,testing
- [ragenApiRequest without an explicit \<T\> silently infers Promise\<unknown\>](lessons/ragen-api-request-promise-unknown-inference.md) — area:integration; module:api-client; topic:type-safety,testing

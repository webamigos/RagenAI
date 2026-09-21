---
title: "`npm run web:e2e` locally differs from CI in two ways nothing announces: no apps/api, and no route table"
modules: ['web', 'api', 'ci']
areas: ['ci', 'testing']
topics: ['e2e', 'playwright', 'adr-21', 'adr-49', 'llm-gateway', 'env-vars', 'false-red', 'stale-processes', 'cost']
---

# `npm run web:e2e` locally differs from CI in two ways nothing announces: no apps/api, and no route table

**Context**: `e2e.yml` builds and starts `apps/api` before Playwright, and sets
`LLM_ROUTES_PATH` to `apps/web/e2e/routes.e2e.yaml`. `npm run web:e2e` does
neither: `playwright.config.ts` starts only the Next server, and reads its
overrides from `apps/web/.env.e2e.local`, which names
`RAGEN_API_INTERNAL_URL=http://localhost:3001` but starts nothing there.

**Problem**: both gaps fail open, and both produce symptoms that read as
application bugs.

*No apps/api.* Phase C of ADR-21 routes several Server Actions through it, so
the project list and thread export are HTTP calls, not queries. A stale
`apps/api` left running from an earlier session — pointed at the `ragen`
development database by the root `.env.local` — answers on 3001 perfectly well,
just from the wrong database. `smoke-11-project-file-upload` and
`smoke-12-thread-export` then fail because the seeded project and thread are
"missing", while `psql` shows both rows present with the right
`organization_id`. That is a full half-hour of looking at the wrong layer. It
also costs more than two tests: the `authenticated` project depends on
`smoke-auth`, so two red smokes meant **160 p0–p3 tests did not run at all**,
under a summary that says `2 failed`.

*No `LLM_ROUTES_PATH`.* The gateway falls back to the production
`infra/llm-gateway/routes.yaml` with the credentials in `.env.local`. Turns that
resolve `mock-model` die with `UnknownModelError` — and turns that resolve a
model the production table *does* cover go out to a real provider. In one local
run the rephraser reached `mistral-small-3.2-24b-instruct-2506` and came back
with `total_tokens: 249`; the mock reports 20 or 1, so that was a billable call
carrying the user's question.
`tests/architecture/a-configured-route-table-path-is-absolute.test.ts` guards
the *shape* of the path, not the fact that one is set.

**Rule**: before believing a local e2e failure, check that `apps/api` is running
**and which database it answers from** (`lsof -nP -iTCP:3001`, then the process's
start time), and that `LLM_ROUTES_PATH` names `apps/web/e2e/routes.e2e.yaml`.
Two red smokes can hide the entire p0 tier, so read `did not run`, not just
`failed`. The durable fix is for the local path to start apps/api itself, or for
`global.setup.ts` to assert both preconditions and stop with a clear message —
a precondition nothing checks is a precondition that will be wrong.

**Applies to**: anyone running `npm run web:e2e` outside CI, and any future
Server Action moved from a direct query to `ragenApiRequest`.

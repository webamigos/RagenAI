---
name: ragen-e2e-triage
description: Run the Playwright E2E suite locally and work out whether a failure is a real regression or your own setup. Use before concluding a failing e2e check is unrelated, when auth or sign-in specs fail, and when setting the suite up for the first time. Triggers on "e2e fails", "test-e2e", "playwright", "smoke-05", "czy to regresja".
---

# Triaging an E2E failure

`test-e2e` is the only check that exercises sign-in end to end, so it catches a
class of regression nothing else does. It is also the check most often written
off as "my environment" — and that mistake has already let a broken `main`
through once. This skill is about telling the two apart.

## The mistake to avoid first

`AGENTS.md` requires `npm run build` before `npm run test:e2e`. Skip it and the
suite fails in a way that is **indistinguishable from a real auth regression**:
the setup project plus `smoke-05` and `smoke-06` all time out on
`page.waitForURL('**/pl/new')`.

That is exactly how a genuine `better-auth` regression got dismissed: the
baseline was stashed, re-run, failed the same way, and read as "not a
regression". It failed for a different reason. **A baseline is only evidence if
the baseline itself is set up correctly.**

Before trusting any baseline comparison, prove the setup works — build, then run
one spec you know passes.

## Setup

Postgres has to be up (`docker compose up`). One time:

```bash
createdb ragen_e2e   # or CREATE DATABASE from any client; `createdb` is not always installed
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/ragen_e2e" npx prisma migrate deploy
# .env.e2e.local (root and/or apps/web) overrides DATABASE_URL / DATABASE_DIRECT_URL
```

Every run:

```bash
npm run web:build                                    # not optional
cd apps/web && npx playwright test "(smoke|p0)-"     # the tier CI gates on
```

The mock LLM server starts itself on :4100 when LiteLLM is not on :4000, so no
model provider is needed.

To rebuild the database when the seed's assumptions have changed — Prisma's own
command, so it needs neither `psql` nor `createdb`:

```bash
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/ragen_e2e" \
  npx prisma migrate reset --force --skip-seed
```

The E2E seed runs from `global.setup.ts`, so it re-seeds on the next test run;
`--skip-seed` avoids also running the app's own `db:seed`.

## Which specs gate a PR

Only `smoke-*` and `p0-*`. The full suite runs on push to `main` and nightly, so
a `p1`–`p3` failure will not block the PR that caused it. Run the gating tier
locally with `npx playwright test "(smoke|p0)-"`.

Projects: `setup` (stores the session), `no-auth`, `smoke-auth`,
`authenticated`. When `setup` fails everything after it is skipped — so "3
failed, 75 did not run" means one thing broke, not seventy-eight.

## Reading a failure

A Playwright timeout is the symptom, never the cause. `waitForURL` timing out
says the redirect did not happen; it does not say why.

1. **Read the server output.** The real message is on a `[WebServer]` line —
   `WARN [Better Auth]: User not found` is what identified the account-lookup
   regression. Playwright's own error says only "Timeout 15000ms exceeded".
2. **Read the page snapshot.** Every failure writes
   `test-results/<spec>/error-context.md` with an accessibility-tree dump of the
   page as it stood. That is how you tell "not signed in" from "signed in,
   wrong data" — the thread page rendered its seeded messages while the sidebar
   said _Brak wątków_, which ruled out auth entirely.
3. **Check the database, do not infer it.** Query `ragen_e2e` for the rows the
   spec expects. Reading the seed source tells you what it intends to write, not
   what is there.

## Deciding: regression or local

Ask CI, which has a clean environment and history:

```bash
gh run list --workflow=e2e.yml --branch=main --limit=8
gh run view <id> --log-failed | grep -E "✘|failed$|›"
```

- **Green on `main` until one commit, red after** → that commit. This is the
  strongest signal available and takes one command.
- **Red on `main` for a while** → pre-existing, and worth saying so rather than
  fixing silently inside an unrelated PR.
- **Passes in CI, fails only locally** → yours. Check the build first, then the
  database, then ports (a native Postgres on 5432 shadows the container —
  `docs/lessons.md`, local environment).
- **Fails in CI, passes locally** → look at what the runner lacks: a service, a
  secret, or the `--incremental` state that a fresh checkout does not have.

Do not use "probably flaky" as a conclusion. If you believe a failure is
unrelated, find it on `main` before your change and put that in the PR.

## After fixing

Re-run the gating tier, not just the one spec — an auth fix moves the session
that every `smoke-auth` spec depends on. If the fix was in `e2e/seed/`, consider
whether real rows share the assumption that was wrong: a seed bug and a missing
migration usually have the same root cause.

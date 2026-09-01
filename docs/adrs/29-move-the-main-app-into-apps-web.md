# ADR-29: Move the Main App from the Repository Root into `apps/web`

**Status:** Accepted and implemented.
**Date:** 2026-09-01

## Context

This repository started as a single Next.js application. `apps/*` arrived later —
`apps/admin`, then `apps/api` (ADR-21), then `apps/worker` (ADR-26) — and
`packages/*` after that (ADR-26/27/28). The original app never moved, so today
the repository root is two things at once: the workspace orchestrator **and** one
of the applications.

That shows up concretely:

- The root `package.json` mixes 12 orchestration scripts (`api:*`, `worker:*`,
  `admin:*`, `packages:build`) with ~30 that belong to one app (`dev`, `build`,
  `test:e2e`, `eval:*`, `db:seed`, `emails:dev`, …).
- `next.config.ts`, `playwright.config.ts`, `vitest.config.ts`, `Dockerfile` and
  `railway.toml` sit at the root and describe that one app, not the repo.
- `src/`, `e2e/`, `evals/`, `public/`, `temporal/` are root-level but app-owned,
  while `prisma/`, `litellm/`, `docker-compose*.yml`, `otel/`, `presidio/` and
  `docs/` are genuinely shared.
- The app is not a Turborepo workspace (ADR-28's tooling work), so it cannot
  join the task graph. Its three CI jobs still need an explicit
  `npm run packages:build` that every other app got to delete.

## Decision

**Move the main application to `apps/web`.**

### Why `web` and not `ragen` or `frontend`

The siblings are `api`, `admin` and `worker` — all **role** names. `ragen` is the
product name, and every app here is ragen; `apps/ragen` beside `apps/api` would
imply the latter is something else.

`frontend` is rejected on accuracy, not taste: this app hosts `/api/v1/chat`,
every Server Action, and the RAG chains. It is the largest backend in the
repository. Calling it the frontend would mislead about where logic lives.

### What moves, and what does not

| Moves to `apps/web` | Stays at the root |
|---|---|
| `src/`, `e2e/`, `evals/`, `public/`, `temporal/` | `prisma/` — one schema, per-app `generator` blocks |
| `next.config.ts`, `playwright.config.ts`, `vitest.config.ts` | `litellm/`, `otel/`, `presidio/`, `supabase/` |
| `Dockerfile`, `railway.toml` | `docker-compose*.yml`, `docs/`, `scripts/` |
| the ~30 app-owned scripts | the 12 orchestration scripts, `turbo.json` |

`prisma/schema.prisma`'s first generator output changes from
`../src/generated/prisma` to `../apps/web/src/generated/prisma`.

### Sequencing

After ADR-28 (Turborepo), deliberately. Turbo makes the task graph explicit, so
after the move the app joins it as an ordinary workspace and the last three
manual `packages:build` CI steps disappear. Doing the move first would have
meant rewriting CI twice.

## Consequences

### Positive

- The root becomes pure orchestration: `package.json`, `turbo.json`, the shared
  schema, shared infrastructure config. Every application is a peer.
- The app joins the Turbo graph — cached builds, and `dependsOn: ["^build"]`
  instead of a hand-maintained prefix.
- `@/*` stops being a repo-root alias, which currently makes it ambiguous which
  app a bare `@/libs/...` import refers to when reading a diff.

### Negative, and the reason this needs care

- **It changes the production deploy root.** `railway.toml` and `Dockerfile` at
  the root are the main app's deploy target; the Railway service's root
  directory and Dockerfile path both have to change in the same window as the
  merge. The equivalent rework for `apps/worker` under ADR-26 took three
  attempts and broke CI twice — and that service carries no user traffic.
- **Large mechanical blast radius**: 109 files reference `src/app`, 18 reference
  `../src/generated`, 18 reference `e2e/`.
- `git blame` gets a rename commit across the whole app. `git log --follow`
  still works per file; blame views in most UIs handle renames, but the noise is
  real.
- Every open PR touching `src/` will conflict. This should land when few are in
  flight.

## Rollout

1. Move files with `git mv` so rename detection keeps history.
2. Split `package.json` — app scripts to `apps/web`, orchestration stays.
3. Repoint: tsconfig paths, prisma generator output, vitest/playwright configs,
   `.eslintignore`, CI workflows, `Dockerfile`/`railway.toml` paths.
4. Add `apps/web` to the Turbo graph; delete the last three `packages:build` CI
   steps.
5. **Update the Railway service's root directory before or with the merge** —
   this is the step that breaks production if forgotten.
6. Verify: lint, unit, build, E2E, plus a real container build and start, the
   same way ADR-26's worker image was checked.

## What the move actually broke

Five things, none of which any test suite would have caught before running:

1. **`"type": "module"` was not inherited.** The root declares it (AGENTS.md's
   ESM convention); the new `apps/web/package.json` did not, so vitest loaded
   its config as CommonJS and ESM-only `vite-tsconfig-paths` failed to load.
2. **`typeRoots` pointed at `./node_modules/@types`.** From the repository root
   that was the hoisted location; from `apps/web` it does not exist, so
   `types: ["node", "jest", "dom-speech-recognition"]` resolved nothing and
   `next build` failed on `Cannot find name 'expect'`. There were *two*
   `typeRoots` keys in the file — the later one won, which cost time.
3. **`prisma generate` in the app's build script.** The schema and
   `prisma.config.ts` live at the root and are shared; generating is the root's
   job (`generate:types`, wired into `postinstall` and its own CI step). The
   app's `build` is now just `next build`.
4. **Two apps imported the generated client by relative path** into the old
   location: `apps/admin/src/lib/db.ts` and `packages/db/index.ts`. Both
   repointed. That they reach into another app's `src/` at all is a smell worth
   its own change — the shared client arguably belongs in `packages/db`.
5. **`test` was `vitest` (watch mode).** Harmless as a root script, a hang as a
   Turbo task. Split into `test` (`vitest run`) and `test:watch`.

## Deliberately left for later

**The dependency split.** All 154 runtime and 77 dev dependencies stay in the
root `package.json`; `apps/web` declares only the four workspace packages, which
is what Turbo needs for its graph. Partitioning 231 dependencies correctly in
the same change that moves the production deploy root is too much risk at once,
and npm's hoisting makes a wrong guess invisible locally while breaking a
scoped install in Docker. The root is therefore *structurally* pure
orchestration but not yet *dependency-wise*.

## Alternatives considered

- **Leave it at the root.** Works, and is what most Next-first monorepos do. It
  keeps a permanent asymmetry and keeps the app outside the task graph. Rejected
  because the repo now has three other apps and four packages; the root app is
  the odd one out rather than the main event.
- **`apps/ragen`.** Product name, not a role — see above.

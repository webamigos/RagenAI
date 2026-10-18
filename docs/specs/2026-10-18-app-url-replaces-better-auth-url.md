---
title: APP_URL replaces BETTER_AUTH_URL as the name for the installation's public origin
status: draft
areas: [auth, config, admin, mcp, self-hosting]
adrs: [37]
---

# APP_URL replaces BETTER_AUTH_URL

## TLDR

`BETTER_AUTH_URL` names a library, not what it holds: the public origin users
reach the installation at — email links, OAuth callbacks, the MCP OAuth issuer
and the browser's own origin all resolve from it. `APP_URL` already exists as
the runtime name the browser reads (`public-runtime-config.ts`), so this is not
a new variable but making the existing good name canonical and demoting
`BETTER_AUTH_URL` to a deprecated fallback. The non-obvious part: today the two
names have **opposite precedence** in two files, and Better Auth reads
`BETTER_AUTH_URL` *by itself* wherever `baseURL` is not passed (apps/admin).

## Open Questions

- **Q1. Hard rename, or `APP_URL` first with `BETTER_AUTH_URL` as a deprecated
  fallback?** Recommendation: **fallback.** Every self-hosted install, the Helm
  chart and the Railway template set `BETTER_AUTH_URL`; a hard rename breaks
  sign-in and silently stops email (`getBaseUrl()` throws inside a mailer that
  catches). The fallback is read in exactly one function, so removing it later
  is a one-line change plus an architecture test flip.
- **Q2. In apps/admin, does `APP_URL` mean the admin panel's own origin?**
  Recommendation: **yes** — that is what `BETTER_AUTH_URL` means there today
  (`admin-e2e.yml` sets it to `:3200`), and `NEXT_PUBLIC_APP_URL` is already
  per-app the same way. `auth-origins.ts` keeps trusting `localhost:3200`, so a
  shared root `.env.local` naming `:3000` still works.
- **Q3. In apps/mcp, `APP_URL` (web's public origin = OAuth issuer) or a
  dedicated `RAGEN_AUTH_ISSUER_URL`?** Recommendation: **`APP_URL`** — the
  issuer *is* apps/web, the shared root `.env.local` already gives mcp the
  right value, and a third name for the same origin is the problem this spec
  removes. `RAGEN_MCP_PUBLIC_URL` (mcp's own URL) is unchanged.
- **Q4. The published docs live in the `ragen-docs` repository.** Update them
  in a follow-up PR there after this merges (needs that repo attached to the
  session), or leave them to you? Recommendation: follow-up PR, same day — the
  docs must not tell people to set a name the code does not read yet.

## Problem

- The name says *which library* consumes the value, not *what it is*. Operators
  read it as "something auth-internal" and leave it at `localhost`, which
  breaks every invitation and reset link (the setup checklist's `app-url`
  finding exists because of this).
- Three names already mean the same origin — `BETTER_AUTH_URL`, `APP_URL`,
  `NEXT_PUBLIC_APP_URL` — and they disagree on precedence:
  - `src/app/emails/utils/base-url.ts`: `BETTER_AUTH_URL` → `APP_URL` →
    `NEXT_PUBLIC_APP_URL`
  - `src/config/public-runtime-config.ts`: `APP_URL` → `NEXT_PUBLIC_APP_URL` →
    `BETTER_AUTH_URL`
  - `src/lib/auth.ts` (`baseURL`): `BETTER_AUTH_URL` only
  An install that sets `APP_URL` and `BETTER_AUTH_URL` to different values gets
  emails and the browser pointing at different hosts.
- The deployment-required check (`src/config/env.ts`) does not accept `APP_URL`
  at all, though `getBaseUrl()` and the setup checklist do — so a deployment
  configured with only `APP_URL` refuses validation while working.

## Out of scope

- **`NEXT_PUBLIC_APP_URL`** stays a fallback exactly as now; removing the
  `NEXT_PUBLIC_` fallbacks is a separate, already-planned cleanup.
- **`BETTER_AUTH_SECRET`** keeps its name — it *is* a Better Auth secret.
- **`RAGEN_APP_URL`** (apps/admin → apps/web *internal* URL, e.g.
  `http://web:3000`) is a different value and is not merged into `APP_URL`.
- Removing the `BETTER_AUTH_URL` fallback — a later release, once deployments
  have moved (tracked in the changelog note).
- Historical specs and ADRs that mention `BETTER_AUTH_URL` are records and are
  not rewritten.

## Proposed solution

1. **One resolver in `@ragenai/env`** (ADR-37: a variable several apps read is
   declared once):
   ```ts
   // packages/env/src/app-url.ts
   export const appOrigin = z.object({
     APP_URL: blankAsUndefined(httpUrl().optional()),
     /** @deprecated read only as APP_URL's fallback */
     BETTER_AUTH_URL: blankAsUndefined(httpUrl().optional()),
   });
   export function resolveAppUrl(env): string | undefined // APP_URL → BETTER_AUTH_URL, blank = unset, trailing slash stripped
   ```
   `fragments.authOrigin` is renamed to `fragments.appOrigin`. Precedence is
   **`APP_URL` → `BETTER_AUTH_URL` → (web only) `NEXT_PUBLIC_APP_URL`**,
   everywhere. `APP_URL` first, not `BETTER_AUTH_URL`, because it is the name
   we want to win, and because the web image's build stage sets a placeholder
   `BETTER_AUTH_URL` that must never shadow a real value.
2. **Every reader goes through it** — web `auth.ts` (`baseURL`,
   `trustedOrigins`), `base-url.ts`, `public-runtime-config.ts`, `env.ts`
   refinement, apps/admin (`auth-origins.ts` **and an explicit `baseURL`** in
   `auth.ts`, so Better Auth stops reading the env var on its own), apps/mcp
   (`env.ts` issuer rules, `server-options.ts`, `auth.ts`).
3. **An architecture test**,
   `tests/architecture/app-url-is-resolved-in-one-place.test.ts`, fails on any
   `BETTER_AUTH_URL` read outside `packages/env/src/app-url.ts` (tests and
   docs excluded). This is what makes the later removal safe.
4. **Deprecation is visible but never fatal**: when only `BETTER_AUTH_URL` is
   set, the resolver logs one warning per process naming `APP_URL`, and the
   setup checklist lists `APP_URL` first. apps/web must not exit over it.

**Rejected:** a hard rename (Q1 — breaks every existing install silently on the
email path); `PUBLIC_URL`/`RAGEN_PUBLIC_URL` (a fourth name, while `APP_URL` is
already shipped and documented in the Railway template and Dockerfile);
keeping `BETTER_AUTH_URL` and only fixing precedence (does not solve the
naming, which is the ask).

## Files to change

### Code (resolver and readers)

| File | Change |
|---|---|
| `packages/env/src/fragments.ts` | `authOrigin` → `appOrigin` (`APP_URL` + deprecated `BETTER_AUTH_URL`) |
| `packages/env/src/app-url.ts` (new) + `index.ts` export | `resolveAppUrl()` with the one-time deprecation warning |
| `apps/web/src/lib/auth.ts` | `baseURL` / `trustedOrigins` from `resolveAppUrl()` |
| `apps/web/src/app/emails/utils/base-url.ts` | resolver first, then `NEXT_PUBLIC_APP_URL`; error message names `APP_URL` |
| `apps/web/src/config/public-runtime-config.ts` | `appUrl` via the resolver, then `NEXT_PUBLIC_APP_URL` |
| `apps/web/src/config/env.ts` | deployment check accepts `APP_URL`; message and `path` name `APP_URL` |
| `apps/web/src/features/setup/services/queries/inspect-environment.ts` | `vars: ['APP_URL', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_APP_URL']` |
| `apps/web/src/app/messages/*.json` (17 locales) | `app-url` hint text names `APP_URL` |
| `apps/admin/src/lib/auth.ts` | explicit `baseURL: resolveAppUrl(process.env)` |
| `apps/admin/src/lib/auth-origins.ts` | origin from the resolver; comments |
| `apps/mcp/src/config/env.ts` | issuer rules on the resolved value; `path: ['APP_URL']` |
| `apps/mcp/src/server-options.ts`, `apps/mcp/src/auth.ts` | resolved value instead of `env.BETTER_AUTH_URL` |

### Tests

| File | Change |
|---|---|
| `packages/env/src/__tests__/app-url.test.ts` (new) | precedence, blank = unset, trailing slash, warning once |
| `tests/architecture/app-url-is-resolved-in-one-place.test.ts` (new) | guard from step 3 |
| `apps/web/src/config/__tests__/env.test.ts`, `public-runtime-config.test.ts` | `APP_URL` cases + legacy fallback case |
| `apps/web/src/app/emails/utils/__tests__/base-url.test.ts` | as above; error names `APP_URL` |
| `apps/web/src/features/setup/__tests__/inspect-environment.test.ts` | new order |
| `apps/admin/src/lib/__tests__/auth-origins.test.ts` | `APP_URL` + legacy case |
| `apps/mcp/src/config/__tests__/env.test.ts`, `__tests__/oauth-http.test.ts`, `__tests__/oauth-jwks-availability.test.ts` | stub `APP_URL`; one legacy case |
| `packages/create-ragen-app/src/__tests__/env-file.test.ts` | unchanged — the fixture tests key-prefix matching, not this variable |

### Configuration and deployment

| File | Change |
|---|---|
| `.env.example`, `apps/admin/.env.example`, `infra/appliance/appliance.env.example` | `APP_URL=…`; comment says `BETTER_AUTH_URL` is still read as a fallback; OIDC callback `<APP_URL>/api/auth/callback/oidc` |
| `apps/web/Dockerfile`, `apps/admin/Dockerfile` | build placeholders `APP_URL` |
| `docker-compose.fullapp.yml` | `APP_URL` for web (and mcp if it sets one) |
| `deploy/helm/ragen/values.yaml` | `APP_URL: ''`; `BETTER_AUTH_URL` removed from defaults (still honoured if a user's values set it) |
| `.github/workflows/ci.yml`, `e2e.yml`, `admin-e2e.yml` | `APP_URL` |
| `.devcontainer/scripts/setup-env.mjs` | writes `APP_URL` |
| `scripts/screenshots/capture.mts` | usage comments |
| `packages/create-ragen-app` | nothing writes the var (it comes from `.env.example`), `manifest-is-current` still passes; **called out in the PR description** per AGENTS.md step 4 |

### Documentation (this repo)

| File | Change |
|---|---|
| `docs/railway-template.md` | `APP_URL` only, for web, admin and mcp; one line on the fallback |
| `.devcontainer/README.md` | `APP_URL` |
| `docs/lessons/next-public-vars-are-baked-in-at-build-time.md`, `docs/lessons/a-documentation-screenshot-photographs-whatever-is-not-running.md` | name `APP_URL`, note the rename |
| `docs/lessons.md` | entry: Better Auth reads `BETTER_AUTH_URL` on its own when `baseURL` is unset |
| `docs/changelog-notes.md` | self-hoster-facing line: `APP_URL` is the name, `BETTER_AUTH_URL` still works for now |
| `AGENTS.md` | no change needed today (does not name the variable); re-checked against the byte budget if anything is added |
| `ragen-docs` repository | follow-up PR (Q4): env reference, self-hosting guide, Railway/Helm pages |

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `packages/env` | fragment rename + resolver | package tests, each app's env tests, `provider-fragments-carry-their-rules.test.ts` |
| auth (`src/lib/auth.ts`, admin `auth.ts`) | `baseURL` source | `test-e2e` (sign-in end to end), `admin-e2e` |
| `packages/create-ragen-app` | none in code | `create-ragen-app-manifest-is-current.test.ts` |

No Prisma, tenancy or RBAC change.

## Failure modes

- **Only `BETTER_AUTH_URL` set** (every install today): works, one warning.
- **Both set, different values**: `APP_URL` now wins for Better Auth too
  (today Better Auth used `BETTER_AUTH_URL`). Behaviour change for such an
  install — it was already inconsistent (browser vs. emails); changelog says so.
- **Neither set on a deployment**: web validation reports `APP_URL`; email
  sending throws with `APP_URL` in the message, as today.
- **admin without `APP_URL`**: Better Auth gets `baseURL: undefined` and falls
  back to request origin exactly as now; `localhost:3200` still trusted
  outside production.

## Phases

### Phase A — resolver and readers (one PR)

- [ ] **A1.** `packages/env`: `appOrigin` fragment, `resolveAppUrl()`, tests.
- [ ] **A2.** web, admin, mcp readers switched; their tests updated.
- [ ] **A3.** Architecture test.
- [ ] **A4.** Config, CI, Docker, Helm, compose, devcontainer, examples.
- [ ] **A5.** Docs in this repo, lesson, changelog note.
- [ ] **A6.** `npm run verify` green (known cloud-session reds aside).

### Phase B — published docs

- [ ] **B1.** `ragen-docs` PR (Q4).

### Phase C — removal (later release, not now)

- [ ] **C1.** Drop the fallback from `resolveAppUrl()`, flip the architecture
  test to forbid `BETTER_AUTH_URL` everywhere.

## Testing

Unit tests per the table above; the e2e path is unchanged and covered by
`test-e2e` / `admin-e2e`, whose workflows switch to `APP_URL` — so CI itself
proves the new name works, and the legacy name is proven by unit tests.

## Rollout and rollback

No migration, no flag: the fallback *is* the rollout. Rollback is reverting the
PR. An install that already dropped `BETTER_AUTH_URL` for `APP_URL` would then
fail old code's deployment check and lose Better Auth's `baseURL` — so the
changelog note tells self-hosters to keep `BETTER_AUTH_URL` alongside `APP_URL`
until Phase C.

---
name: ragen-code-review
description: Review a change against this repository's own invariants — tenant scoping, the two role hierarchies, feature-module CQRS, library-owned tables, which e2e tier gates a merge. Use before opening a PR, when reviewing one, and before claiming a change is safe. Triggers on "review", "przejrzyj", "code review", "czy to jest gotowe do merge".
---

# Reviewing a change here

Generic review advice is available everywhere. This is the list of things that
are specific to this repository, ordered by what has actually gone wrong.

Run `npm run verify` first — lint, typecheck, tests and builds across every
workspace. Everything below is what the gate cannot check.

## 1. Authorization lives in the data path

- A **layout guard protects rendering and nothing else.** A Server Action is a
  POST endpoint; it does not run the route's layout. Every action needs its own
  guard as its first statement. `apps/admin` asserts this mechanically —
  `server-actions-are-guarded.test.ts` checks the _first statement_, not that a
  guard appears somewhere in the body.
- **Never trust a client-supplied `orgId` or `userId`.** Derive from the
  session: `getOrgIdFromAuthOrThrow()`, `getCurrentUserId()`. See
  `ragen-tenant-scope-audit` for the query shapes that leak.
- **Two role hierarchies, never conflated**: `User.role` (`admin` | `user`) is
  platform-level; `Member.role` (`owner` | `admin` | `member`) is per-org. Use
  `isAppAdmin(user)` / `isOrgAdmin(member.role)` — never an inline comparison.

## 2. A library that owns a table owns how it is queried

Writing a Better Auth table directly with Prisma couples the code to queries it
cannot see. An upgrade can start filtering on a column that was previously
write-only, and nothing in typecheck, lint or migrations notices — that cost a
red `main`. `tests/architecture/` holds the tripwire for `accounts`; check
whether the change needs another.

## 3. Structure

- New domain logic goes in `src/features/<feature>/`, not into an actions file.
  Queries are `get*Query()` and return data; commands are `*Command()`.
- Types from `@/features/<feature>/contracts/`, logic from `…/services/`.
- One `prisma/schema.prisma` for the whole monorepo, with a `generator` block
  per app. Do **not** add a second schema.
- Navigation uses `Link`/`redirect`/`useRouter` from `@/i18n/routing`, never
  `next/navigation` — that is what keeps the locale prefix. The one deliberate
  exception is `hardNavigate`, for reloads after a session change.

## 4. Tests, and specifically which ones gate the merge

- A PR adding code with no test is incomplete. The two cases most often missed:
  workspace package code, and the small per-app files that bind it.
- **The e2e prefix decides whether a failure blocks the PR.** Only `smoke-*`
  and `p0-*` run on a pull request; `p1`–`p3` run on push to `main` and
  nightly. A test that must block a merge belongs in the first tier — putting
  it in `p2` means the PR that breaks it goes green.
- A mock that agrees with itself proves nothing. The regression this week passed
  every unit test and was caught only by `test-e2e`.

## 5. Failure behaviour

- `catch (error)` where the error is never used discards it. There are ~29 of
  those; each is a place where something can fail with no trace. New ones should
  log or explain.
- Errors use `UnauthorizedException`, `NotFoundException`,
  `LimitExceededException`.
- Secret comparisons use `crypto.timingSafeEqual()`. `dangerouslySetInnerHTML`
  only with DOMPurify. Never `NEXT_PUBLIC_` for a key.

## 6. Before saying it is ready

- Did anything non-obvious bite you? Add a lesson to `docs/lessons.md`.
- Is a required check red? That is the answer, not a nuisance. `main` currently
  has **no required status checks configured**, so nothing blocks a merge
  mechanically — which is exactly how a red `test-e2e` reached `main`. If you
  believe a failure is unrelated, prove it against `main` before your change.

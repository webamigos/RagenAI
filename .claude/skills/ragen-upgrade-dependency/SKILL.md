---
name: ragen-upgrade-dependency
description: Upgrade a dependency in this monorepo — especially one that owns database tables (better-auth, prisma) or is shared by several workspaces. Use for any major or minor bump, for clearing an npm audit advisory, and whenever an upgrade hits ERESOLVE. Triggers on "upgrade X", "bump X", "npm audit", "podbij X", "clear the advisory".
---

# Upgrading a dependency here

The failure this is written against: `better-auth` 1.4.18 → 1.7.2 shipped with
unit tests green, both app builds green, and the changelog read. It broke
sign-in, `main` went red, and the only thing that caught it was `test-e2e` —
which the PR merged past. Full account:
`docs/lessons/seeded-rows-must-satisfy-the-librarys-lookup.md`.

## 1. Scope it before touching the lockfile

```bash
npm ls <package> --depth=0        # which workspaces resolve it
grep -rln "<package>" apps/*/src packages/*/src --include=*.ts | head
```

Then answer one question, because it decides how much of the rest applies:
**does this library own database tables?** `better-auth` owns `users`,
`sessions`, `accounts`, `verifications`, `organizations`, `members`,
`invitations`, `teams`, `team_members`. Prisma owns the migration machinery. If
the answer is yes, sections 3 and 4 are the work; if no, they are quick.

## 2. Read the release notes, then distrust them

Notes describe what the authors changed. They do not enumerate every field a
query now filters on. In the incident above they named the new `issuer` column
and said nothing about the match widening to `accountId` — so the migration
backfilled one and not the other, and looked complete.

## 3. Read what the new version actually queries

This is the step that would have caught it. Install the new version, then read
the library's own lookups in `node_modules`:

```bash
npm install <package>@<version> --package-lock-only
# where does it query the tables it owns?
grep -rln "internalAdapter\.\|findUserByEmail\|findAccount" node_modules/<package>/dist/**/*.mjs
```

Open the route or adapter for the flow you care about (sign-in, session, the
org membership lookup) and write down **every field in the predicate**. In 1.7
that was three where 1.4 had one:

```js
account.providerId === 'credential' && account.issuer === createLocalAccountIssuer('credential') && account.accountId === userRecord.user.id;
```

A column that was write-only in the old version and is filtered on in the new
one is invisible to typecheck, lint and migrations. Nothing but reading the
query finds it.

## 4. Find the code that writes those tables directly

Anything writing a library-owned table with Prisma is coupled to queries it
cannot see:

```bash
grep -rnE "(prisma|db)\.(user|session|account|verification|organization|member|invitation|team|teamMember)\.(create|createMany|upsert|update)\(" \
  apps/*/src apps/web/e2e prisma | grep -v "/generated/"
```

For each hit, check it still satisfies the predicate from step 3. `accounts` has
a guard for this — `tests/architecture/better-auth-account-writes.test.ts` —
and if you find a second table worth policing, add one beside it rather than a
comment.

## 5. Migrate existing rows, and check invariants as well as columns

A new column needs a backfill. So does a column whose **meaning** changed:
`accountId` was already populated, with the wrong thing. Write the migration to
fail loudly rather than half-apply — see
`prisma/migrations/20260902120000_normalize_credential_account_id/migration.sql`,
which refuses to run when the backfill would collide and names the affected
rows.

Then check the data before deploying:

```sql
-- adapt per upgrade; the point is to ask whether real rows satisfy the new query
select count(*) from accounts where provider_id = 'credential' and issuer is null;
select count(*) from accounts where provider_id = 'credential' and account_id <> user_id;
```

## 6. Resolve ERESOLVE by moving the constraint, not overriding it

When peers deadlock, look for the version of _another_ package that dissolves
the conflict before reaching for `overrides`. The vitest 4 upgrade deadlocked on
`@vitejs/plugin-react` 6.x (which wants vite ^8); 5.2.0 satisfied everything and
needed no override. An `overrides` entry silences the resolver without making
the combination correct.

Two traps in the same area:

- `--engine-strict` will fail the install if your Node is not 24.x. Use nvm.
- **Never read an npm exit code through a pipe.** `npm install … | tail` reports
  `tail`'s status, which is always 0. Capture the output, then check `$?`.

## 7. Run the gate — the whole one

```bash
npm run verify                       # lint + typecheck + test + build, every workspace
npm run build && npm run test:e2e    # the build is not optional; see ragen-e2e-triage
```

For anything touching auth, sessions or organizations, `test:e2e` is the only
check that exercises sign-in end to end. Unit tests pass with mocks that agree
with themselves.

## 8. Do not merge on red

`main` has no required status checks configured, so a red check does not block
anything mechanically. It is still the answer. If a check fails and you believe
it is unrelated, prove it — find the same failure on `main` before your change,
and say so in the PR. "Probably flaky" has been wrong here at least once, and it
cost a broken `main` plus half a day.

## 9. Log what bit you

If the upgrade turned up a non-obvious trap, add it to `docs/lessons.md` per
that file's instructions. The lesson above is why this skill exists.

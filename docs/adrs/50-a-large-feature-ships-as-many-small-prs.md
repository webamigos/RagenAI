# ADR-50: A Large Feature Ships as Many Small Pull Requests onto `main`

**Status:** Accepted. Mostly a record of how the repository already works —
`main` is the only long-lived branch and the CI is already shaped for it — plus
one thing that was not written down anywhere: what to do when a feature is too
big for one pull request and several people are building it. No code changes.
**Date:** 2026-09-19

## Context

`main` is the trunk. Every pull request is opened against it and merges back
into it. The question this ADR answers came up when a feature was large enough
that nobody wanted to review it as one diff, and more than one person was
working on it:

> Should we cut a release branch, or open one big pull request?

Neither. Four things in this repository make a long-lived branch more expensive
than it looks, and they are easy to miss because three of them live in CI
configuration rather than in code.

### We already tried an integration branch and dropped it

`.github/workflows/e2e.yml:11` says so in as many words:

> The tiering used to key off `dev` as the integration branch. With PRs going
> straight to main, the fast tier moved to the PR and the full suite to the
> push that follows it — same trade, one branch fewer.

A release branch is `dev` again under a different name, and it brings back the
tiering problem that removing it solved.

### CI is deliberately shaped for stacked pull requests

`.github/workflows/ci.yml:6` carries the reason the `pull_request` trigger has
no `branches:` filter: that filter matches the pull request's **base**, so a
branch opened against another branch still in review matched nothing and ran no
CI at all. `#1120` and `#1121` both merged having been checked only on a laptop.

So stacking works — a pull request based on another pull request is a supported
shape here, and it was made supported on purpose. It has one trap, named in the
same comment: **GitHub does not re-fire the event when a base is auto-retargeted
to `main` after the parent merges.** The child keeps a green tick earned against
the parent's tree and nothing re-checks it against the tree it will actually
merge into.

### A release goes out on every push to `main`

`.github/workflows/release.yml:4` runs semantic-release on `push: main`. Work
held off to the side for three weeks lands as one release instead of a series,
and nothing in it can be rolled back separately from the rest of it.

### A pull request only ever runs the fast E2E tier

`e2e.yml:277` decides the tier from the event, not the base:

```sh
elif [ "$EVENT_NAME" = "pull_request" ]; then
  # Every PR now targets main, so the base ref no longer selects a
  # tier — being a PR at all is what makes it the fast one.
  scope="fast"
```

A pull request runs `(smoke|p0)-`, 82 of 175 specs. The full suite runs on the
push to `main` that follows the merge, and nightly. The larger the pull request,
the more code meets the other 93 specs for the first time *after* it has landed.
Pointing pull requests at an integration branch does not buy back the full tier:
they are pull requests, so they get the fast one too.

### One schema, timestamped migrations, several people

There is one `prisma/schema.prisma` for the whole monorepo (ADR-21 and the
per-app `generator` blocks). Two people editing it on the same long-lived branch
conflict in a file where a merge resolution is a schema decision, and a
migration authored three weeks ago carries a directory name that sorts before
migrations that have since landed on `main`.

### The mechanism for hiding unfinished work already exists

`packages/platform-contracts/src/features/features.ts:23` — `FEATURE_KEYS`,
resolved through per-org override → plan → platform default → code default.
`voiceInput` and `publicThreadLinks` are both in there defaulting to `false`,
which is exactly the shape an unfinished feature needs.

## Decision

**A large feature is sliced into small pull requests that each merge into
`main` on their own, behind a feature key that defaults to `false`.** The branch
is not where the feature is kept unfinished — the flag is.

The usual slicing, each step its own pull request:

1. **Migration.** Additive only: new tables, new nullable columns, columns with
   a default. No code reads them yet.
2. **Domain layer.** `src/features/<feature>/` — contracts, queries, commands,
   with tests. Nothing calls it yet, and the tests are what make it reviewable.
3. **Surface.** Routes, actions and UI, gated on the new feature key. The key is
   `false` in `DEFAULT_FEATURES`, so the surface ships absent.
4. **Flip.** Turn the key on, add the `smoke-*`/`p0-*` specs that must gate
   future merges (`p1`–`p3` will not — see AGENTS.md on the naming).

Each of these is green on its own, merges on its own, and is revertable on its
own.

### Rules that make this work with several people

- **Branch off `main`, not off a teammate's branch**, unless you genuinely need
  their unmerged code. Then stack: base your pull request on theirs.
- **After a parent merges, push something to the stacked child** — a merge of
  `main`, a rebase, anything — to force CI to run against the retargeted base.
  The tick it is carrying was earned against a tree that no longer exists.
- **Migrations go straight to `main`, one per pull request, early.** Never
  batched with the code that uses them and never held on a side branch.
- **Expand/contract for anything that changes an existing column.** Add the new
  shape, move the reads, backfill, and only then drop the old one — in a later
  pull request, after the code that used it is gone from `main`.
- **The flag is added in the first pull request that needs it**, not the last.
  A key defaulting to `false` costs nothing and means every subsequent slice can
  merge whenever it is ready.

## When an integration branch is nonetheless right

There are cases — a feature reviewed as a whole by someone outside the team, a
rewrite where the intermediate states are not honestly shippable — where one
pull request is the point. Then:

- Cut `feature/<name>` from `main`. Everyone opens small pull requests **into
  it**, so every slice is still reviewed small.
- **Merge `main` into it daily**, not at the end. Merge, not rebase: other
  people have it checked out.
- **Know that pushing to it runs no CI.** `ci.yml:4` filters `push` to `main`.
  Pull requests into the branch run, the daily merge commit does not. Either add
  the branch to `push.branches` for as long as it lives, or accept that the
  branch's own head is unverified between pull requests.
- **Run the full E2E tier by hand before merging to `main`.** `e2e.yml:34`
  exposes `workflow_dispatch` with `scope: full`; run it against the feature
  branch. Otherwise the full suite meets the whole feature only after it lands.
- **Keep the migrations out of it.** They still go straight to `main`.
- **Keep the flag anyway.** It is what lets the branch merge while the feature
  is still not quite done, instead of living another week.

## Consequences

- Reviews stay small, which is the only reliable way to keep them real.
- Releases stay small and individually revertable, which is what
  `release.yml` assumes.
- Unfinished code sits on `main`, unreachable behind a `false` key. That is a
  trade: dead code is visible in the tree, and somebody has to remove the key
  once the feature is permanent. Worth it against a three-week branch.
- The flag becomes a product control after launch rather than being deleted —
  which is how `voiceInput` and `publicThreadLinks` ended up useful.
- Ignoring this reproduces `#1120`/`#1121`: a diff that is green because nothing
  ran against the tree it merged into.

## Alternatives considered

**A release branch / git-flow.** Rejected: it is `dev`, which this repository
removed on purpose (`e2e.yml:11`), and it delays every release behind the
slowest feature on it.

**One long-lived feature branch with one big pull request.** Rejected as a
default, kept as the documented escape hatch above. The cost is not the review —
it is that the full E2E tier, the migration ordering and the release all get
their first look at the whole thing at once.

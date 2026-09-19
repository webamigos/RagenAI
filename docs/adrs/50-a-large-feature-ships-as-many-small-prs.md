# ADR-50: A Large Feature Ships as Many Small Pull Requests onto `main`

**Status:** Accepted. Mostly a record of how the repository already works —
`main` is the only long-lived branch and the CI is already shaped for it — plus
one thing that was not written down anywhere: what to do when a feature is too
big for one pull request and several people are building it. The only change
outside this file is the `[no release]` opt-out in `.releaserc`.
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

## Which commits cut a release

Slicing a feature into several pull requests has one visible cost: with
`release.yml:4` running semantic-release on every push to `main`, ten merges
used to mean ten version bumps for one feature. The version is at `1.256.x`
largely because of that.

The bumps are not the expensive part. `publish-images.yml:22` triggers on
`release: types: [published]` and builds five container images — `worker`,
`api`, `admin`, `mcp`, `web` — moving `latest` with each one (`:87`). So a merge
of an internal slice, hidden behind a key that is `false`, republished every
image for everybody self-hosting.

**The commit type is what decides, and for a flag-gated slice the honest type is
not `feat`.** semantic-release's default rules bump on `feat` (minor), `fix` and
`perf` (patch), and a breaking change (major); `chore`, `refactor`, `test`,
`docs`, `ci`, `build` and `style` release nothing. Mapped onto the four slices
above:

| Slice | Type | Release |
|---|---|---|
| 1. Migration — additive, nothing reads it | `chore(db):` | none |
| 2. Domain layer — nothing calls it | `chore(web):` / `refactor(web):` | none |
| 3. Surface behind a `false` key | `chore(web):` | none |
| 4. Flip the key | `feat(web):` | one minor |

One feature, one release. This is not a loophole in the convention, it is the
convention read correctly: `feat` describes what a user receives, and code
behind a disabled flag delivers nothing. The same goes for `fix` — a correction
to code that never shipped is not a fix for anyone, it is `chore`.

Pull requests are squash-merged here (every commit on `main` carries its
`(#1234)`), so the pull request title *is* the commit subject. The title is the
whole lever; nothing has to be policed in anyone's local history.

For the cases where the type has to stay `feat` or `fix` and a release still is
not wanted — a CI fix worth landing but not worth five images — `.releaserc`
carries an explicit opt-out:

```json
"releaseRules": [
  { "breaking": true, "release": "major" },
  { "subject": "*\\[no release\\]*", "release": false }
]
```

`fix(ci): give the image build a driver that can cache [no release]` bumps
nothing. The commit still appears in the next release's notes, so nothing is
lost from the record, and when every commit since the last tag is marked,
semantic-release does nothing at all rather than cutting an empty release.

Three things about that config are not guessable, and getting any of them
wrong is silent:

- **A rule value is a glob, matched with micromatch**, so the brackets have to
  be escaped. `"*[no release]*"` is a character class — one character out of
  `n o ' ' r e l a s` — which matches very nearly every commit subject in this
  repository and switches releases off altogether. It was written that way here
  first, and the only symptom is a release that never comes.
- **A matching rule that says `release: false` returns `false`, not
  `undefined`**, and `index.js` falls back to the default rules only on
  `undefined`. That is the whole mechanism: the marker suppresses the release
  precisely because a matched rule stops the fallback.
- **Matching rules do not resolve first-to-last — the highest release type
  wins** (`analyze-commit.js`), and `major` ends the analysis early. So a commit
  carrying both a `BREAKING CHANGE` footer and the marker releases `major`
  whichever order the two rules are in. The breaking rule is not ordering, it
  is the guarantee: without it the marker would silence the one release that
  must never be silent, because the notes announcing the break would not be
  published either. It is written first so the short-circuit can take effect.

Anything matching no rule at all falls through to the defaults, which is why
they are not restated here.

A marker in the subject rather than a scope like `feat(no-release):`, because
scopes are spoken for: one per workspace, since `#1253`.

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
- A feature cuts one release rather than ten, and moves `latest` on the
  published images once rather than ten times — without holding anything back
  from `main` to achieve it.
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

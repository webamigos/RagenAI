---
title: 'A PR opened against another branch gets no CI at all, and retargeting it to main does not start a run — so its green state means nothing ran'
modules: ['ci', 'worker']
areas: ['ci']
topics: ['github-actions', 'stacked-prs', 'branch-filters', 'fail-open', 'architecture-tests', 'merge-queue']
---

# A PR opened against another branch gets no CI at all, and retargeting it to main does not start a run — so its green state means nothing ran

**Context**: ADR-40 was migrated in six PRs, several of them stacked — each
step needed the client or the guard the previous one added, and `main` had not
merged it yet. Step 3c (#944) was opened with its base set to step 3b's branch
for that reason, then retargeted to `main` once 3b was ready. `gh pr view`
reported `CLEAN`, the checks list showed `Test pass`, and it was merged.

**Problem**: it had no CI run at all. `.github/workflows/ci.yml` triggers on

```yaml
on:
  pull_request:
    branches: [main]
```

so a pull request whose base is any other branch never starts the workflow —
not skipped, not pending, absent. And **changing the base afterwards does not
start one**: GitHub attaches check runs to the head commit, and that commit had
not changed, so there was nothing to re-evaluate. `mergeStateStatus: CLEAN`
means "no required check is failing", which is satisfied vacuously when no
required check exists. The checks list showing `Test pass` was the _previous_
PR's result surfacing through a shared ref, not this one's.

The cost was a red `main`. Step 3c moved the nightly cleanup's message
deletion from knex to Prisma, and
`tests/architecture/thread-deletion-must-remove-messages.test.ts` asserts that
deletion exists by matching the source — with a knex-shaped pattern,
`('messages') … .del(`. The guard did the right thing and failed. It failed
into a job that was never scheduled, so nothing reported it: `main` was red
from 990fae48 (#944) through 7e10caaa (#945) and only went green again at
06d43bac (#946), which updated the pattern to `.message.deleteMany(`.

Worth separating the two halves, because only one of them is a bug. The guard
being tied to a knex idiom is not a flaw — a source-matching guard is
_supposed_ to break when its target is rewritten, and that file carries a
guard-on-the-guard for exactly this. Every architecture test in
`tests/architecture/` has this property, so any refactor of the code they read
will trip one. That is the design working. The bug is that the trip happened
where nobody was looking.

**Rule**: a stacked PR's checks mean nothing until its base is `main` **and**
its head commit has moved since. Before merging any PR, confirm a run exists
rather than reading its colour:

```bash
gh api repos/<owner>/<repo>/commits/<head-sha>/check-runs \
  --jq '[.check_runs[] | select(.name=="Test")] | length'
```

Zero means untested, whatever `gh pr checks` prints. The fix for a stack is a
rebase onto `main` — `git rebase --onto origin/main <base-tip>` — which both
retargets and produces a new head commit, so CI starts. Retargeting alone with
`gh pr edit --base main` is not enough.

This is the same failure family as
[a path glob that matches nothing](path-filters-fail-open-after-a-directory-move.md)
and [an `if: secret != ""` guard](a-secret-guarded-ci-step-fails-open.md): the
absence of a check is indistinguishable from a check that passed, and nothing
in the interface distinguishes them. Green is only evidence when something ran
— the same reason a fully-cached `npm run verify` reporting `45/45` with
`45 cached` is not evidence either, and `npx turbo run … --force` is.

**Applies to**: any stack of PRs in this repository — the ADR-41 and ADR-40
migrations were both done as stacks, and the remaining ADR-32 absorptions will
be. Also to anyone reading `mergeStateStatus` programmatically to decide
whether to merge: it answers a different question than the one being asked.

## The review is missing too, and it costs more than the tests

CodeRabbit does not review a PR whose base is another PR either, and its check
still reports `pass`. The Ragen Brain stack (2026-09-23/24) ran to thirty PRs
with one review — the first, based on `main`. Everything above it had green
local gates (`npm run verify` 71/71) and live runs against a real worker and
Qdrant, and was still carrying fifteen defects that two review passes over
`git diff origin/main...HEAD` found in one sitting: an assistant-scoped API key
reading the whole curated corpus; a second vector-write path (version rollback)
that indexed files the stack had just taught ingest to keep out; a stale
publish run deleting a newer run's chunks by file id; retries that turned an
unusable model answer into "no contradiction" and closed open findings. None
of these is visible to a test the author writes, because each is a path the
author did not think of — which is exactly what review is for.

**Rule, added**: a stack gets a review of its cumulative diff before its first
merge, not one per PR as it lands. Run it as review agents over
`origin/main...<stack tip>` split by concern (tenant scope and access; silent
failures), fix what they confirm at the top of the stack, and only then start
merging from the bottom. Rebasing onto `main` later triggers CodeRabbit per PR,
but by then the defects are spread across a dozen merges.

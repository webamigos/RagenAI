---
title: "`npm run verify` races apps/web's build against its own typecheck, so the gate only passes when turbo's cache is warm"
modules: ['web', 'ci']
areas: ['ci', 'testing', 'architecture']
topics: ['turborepo', 'caching', 'nextjs', 'generated-types', 'false-green', 'monorepo-tasks', 'stale-artifacts', 'branch-switching']
---

# `npm run verify` races apps/web's build against its own typecheck, so the gate only passes when turbo's cache is warm

**Context**: `npm run verify` is `generate:types && turbo run lint typecheck test build`
— one turbo invocation covering four tasks across every workspace. AGENTS.md
calls it "THE gate" and "the one command that checks all of them at once".

**Problem**: `turbo.json` declares `typecheck: { dependsOn: ["^build"] }`. The
caret means _dependencies'_ builds — the packages a workspace consumes. It says
nothing about the workspace's **own** build, so `@ragenai/web#typecheck`
and `@ragenai/web#build` are unordered siblings and turbo runs them
concurrently.

`next build` regenerates `apps/web/.next/types/`, and `tsconfig.json` includes
that directory. So typecheck reads files that build is rewriting underneath it,
and fails on a half-written tree:

```
.next/types/validator.ts(5,79): error TS2307: Cannot find module './routes.js'
```

`routes.d.ts` is present by the time you look, which is what makes this so
confusing — the file the error names exists, and re-running the same typecheck
on its own passes.

It stays invisible because it needs a **cold cache** to fire. With anything
cached, `build` replays in milliseconds and the window never opens. A run that
changes `package-lock.json` invalidates every hash at once, which is exactly
when it bites: during this migration `verify` passed twice with 39 and 47 of 53
tasks cached, then failed twice in a row at `0 cached` after an `npm install`,
then passed again at `53 cached`.

Two wrong conclusions are easy here, and I reached both before the right one.
First, that the failure was in the change under test — `git stash` does not
revert `node_modules`, so stashing and re-running proves less than it appears
to. Second, that the clean tree was fine — the filtered `turbo run typecheck
--filter=…web --force` I used to "confirm" that does not run `build` at all, so
the race cannot fire and **both** trees pass it.

CI is unaffected: `ci.yml` runs `npm run typecheck` and `npx turbo run build` as
separate jobs on separate runners, so the two never share a working tree.

## The same error with a different cause: a `.next` left by another branch

`TS2307` out of `.next/types/validator.ts` has a second source, and the two are
worth telling apart because the test above separates them and the obvious
reading of it is backwards.

Next generates a route validator that imports every page module it found when
it last built. Switching to a branch without one of those pages leaves the
validator behind, still importing it:

```
.next/types/validator.ts(161,39): error TS2307: Cannot find module
  '../../src/app/(dashboard)/guardrails/page.js'
```

The page is genuinely absent on this branch — it exists on the one that was
built last. Measured here: `apps/admin` built on a feature branch that adds
`/guardrails`, then `main` checked out, then `npm run verify` — 49 of 65 tasks,
failing on `@ragenai/admin#typecheck` for a route the branch never had.

**This is the case that breaks the confirmation step below.** Re-running
`npm run typecheck` alone does not clear it: the stale file is still there, so
it fails again — and a reader following "if it passes it was the race" then
concludes the opposite of the truth, that the change under test is at fault.
Clearing it is one command — both Next apps, so there is nothing to
substitute and nothing to get wrong:

```bash
rm -rf apps/web/.next apps/admin/.next
```

The same typecheck then passes on an unchanged tree.

Two ways to tell them apart without guessing:

- **Read the module the error names.** The race reports a file that *should*
  exist and momentarily does not (`./routes.js`). The stale artifact reports a
  path that does not exist on this branch at all, and usually names a route —
  which is the tell, because a route is a thing a branch adds or removes.
- **Ask whether you switched branches since the last build.** The race needs a
  cold cache; the stale artifact needs a branch switch. Neither needs the
  change under test.

**Rule**: a `verify` failure in a Next app's `typecheck` that names a file
under `.next/types` is an artifact problem, not the change under test — but
*which* artifact problem decides how you confirm it. Re-run
`npm run typecheck` on its own: passing means the cold-cache race, failing
again means a `.next` from another branch, which
`rm -rf apps/web/.next apps/admin/.next` clears. Do not "fix" either by editing the reported file; it is generated.
The durable fix is an explicit `build` edge for web's typecheck
(`dependsOn: ["^build", "build"]`), which also reflects reality — typechecking
Next's generated validator before the build that generates it is meaningless.

More generally: when a gate fails, establish whether the task actually ran
before or was replayed from cache. `cache hit, replaying logs` in the turbo
output means that task proved nothing about the current tree.

**Applies to**: `npm run verify` and any local `turbo run` that includes both
`typecheck` and `build`; `apps/web` and `apps/admin`, the two Next apps with
generated types under `.next/`. The stale-artifact half applies to any branch
switch between those two apps' builds, which a stacked series of PRs makes
routine.

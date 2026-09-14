---
title: "`npm run verify` races apps/web's build against its own typecheck, so the gate only passes when turbo's cache is warm"
modules: ['web', 'ci']
areas: ['ci', 'testing', 'architecture']
topics: ['turborepo', 'caching', 'nextjs', 'generated-types', 'false-green', 'monorepo-tasks']
---

# `npm run verify` races apps/web's build against its own typecheck, so the gate only passes when turbo's cache is warm

**Context**: `npm run verify` is `generate:types && turbo run lint typecheck test build`
— one turbo invocation covering four tasks across every workspace. AGENTS.md
calls it "THE gate" and "the one command that checks all of them at once".

**Problem**: `turbo.json` declares `typecheck: { dependsOn: ["^build"] }`. The
caret means _dependencies'_ builds — the packages a workspace consumes. It says
nothing about the workspace's **own** build, so `@webamigos/ragen-web#typecheck`
and `@webamigos/ragen-web#build` are unordered siblings and turbo runs them
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

**Rule**: a cold-cache `verify` failure in `apps/web#typecheck` that names a
file under `.next/types` is this race, not the change under test. Confirm by
re-running `npm run typecheck` on its own — if it passes, that is the race and
not a regression. Do not "fix" it by editing the reported file; it is generated.
The durable fix is an explicit `build` edge for web's typecheck
(`dependsOn: ["^build", "build"]`), which also reflects reality — typechecking
Next's generated validator before the build that generates it is meaningless.

More generally: when a gate fails, establish whether the task actually ran
before or was replayed from cache. `cache hit, replaying logs` in the turbo
output means that task proved nothing about the current tree.

**Applies to**: `npm run verify` and any local `turbo run` that includes both
`typecheck` and `build`; `apps/web` and `apps/admin`, the two Next apps with
generated types under `.next/`.

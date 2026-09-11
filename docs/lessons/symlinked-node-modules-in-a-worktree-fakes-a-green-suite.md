---
title: 'Symlinking node_modules into a git worktree makes the test suite run against the primary checkout, and report green'
modules: ['web', 'admin', 'api']
areas: ['testing']
topics: ['git-worktrees', 'node-modules', 'turbopack', 'vitest', 'turborepo', 'verification']
---

# Symlinking node_modules into a git worktree makes the test suite run against the primary checkout, and report green

**Context**: deleting a dead module in `apps/web` from a git worktree created off
`origin/main`, so the primary checkout — parked on another session's feature branch —
stayed untouched. A worktree starts without `node_modules`, and a full `npm ci` on this
monorepo installs ~5 GB, so the tempting shortcut is to symlink the primary checkout's
`node_modules` (root plus each `apps/*`) into the worktree and run `npm run verify`.

**Problem**: the shortcut fails in two ways, and only one of them is visible.

The visible one: `next build` refuses outright, with
`Symlink [project]/apps/web/node_modules is invalid, it points out of the filesystem
root` wrapped in a `TurbopackInternalError` and a stack of `Execution of ... failed`
lines that name resolver internals and never mention your change. It reads like a
broken build; it is a broken setup.

The silent one is worse. Vitest resolves its root through the symlink to the *real*
path, so `@webamigos/ragen-admin:test` printed
`RUN v4.1.11 /Users/patryk/Workspace/webamigos/ragen/ragen-app/apps/admin` — the
**primary checkout**, not the worktree. It ran 462 tests against files that do not
contain your change and reported all of them passing. Every cached-task line and green
tick in that run was about someone else's working tree. Nothing in turbo's summary says
so; the only tell is the absolute path in one line of vitest's banner, which scrolls
past in a 52-task run.

**Rule**: a worktree needs its own real `npm ci` — do not symlink `node_modules` into
one. If you take the shortcut anyway because you only want a quick unit test, read the
path in the runner's banner and confirm it points inside the worktree before believing
a single result. Then run `npx prisma generate` in the worktree too: the generated
client is gitignored, so without it `tsc --noEmit` and three `apps/api` suites fail on
`Cannot find module '../generated/prisma/client.js'`, which also looks like a code
regression and is not one.

Budget for it: `npm ci` here writes ~5 GB. Check `df -h /` first — this repo has a
documented disk-exhaustion cascade, and a worktree install is a large, easy-to-forget
addition to it. Remove the worktree when done (`git worktree remove <path> --force`).

**Applies to**: any git worktree of this monorepo where you intend to run `npm run
verify`, a workspace build, or a test suite whose result you plan to trust.

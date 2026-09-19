---
title: 'One `tsconfig.json` cannot be both the typecheck project and the build, and the cost of conflating them is not the size it looks like'
modules: ['worker', 'api', 'mcp']
areas: ['architecture', 'ci']
topics:
  [
    'typescript',
    'tsconfig',
    'docker',
    'image-contents',
    'dead-code',
    'devdependencies',
    'measurement',
    'architecture-tests',
  ]
---

# One `tsconfig.json` cannot be both the typecheck project and the build, and the cost of conflating them is not the size it looks like

**Context**: `apps/worker` built with `tsc --build` straight from `tsconfig.json`, whose `include` is `src/**/*.ts` and whose `exclude` was `node_modules` alone. That is the right shape for type-checking — a suite nothing compiles is exactly the drift CI's typecheck job exists to catch — and the wrong one for an artifact.

**Problem**: every published worker image carried 252 compiled test files: the specs, a fixture module, and their `.d.ts` and `.map` siblings. `apps/mcp` and `apps/api` each already had a `tsconfig.build.json` that excludes tests, so this was one app's oversight rather than a missing convention, and nothing reported it — the build's exit code is the same either way, and `du -sh dist` is not something anyone runs.

**The interesting half is what it did *not* cost.** The obvious framing is dead weight, and by that measure the fix is worth nothing: `dist` went 4.7 MB → 3.2 MB and the image stayed at 1.05 GB, the difference being three orders of magnitude below the node_modules it sits next to. Reporting this as an image-size win would have been a measurement nobody checked.

What it actually cost is that the build output **lied about its own dependencies**. Three of those files import `@temporalio/testing` and `@temporalio/nyc-test-coverage` — devDependencies that `npm ci --omit=dev` deliberately leaves out — so `grep -rhoE '@temporalio/[a-z-]+' dist` named six packages where the runtime needs three. That is not hypothetical tidiness: `ragen-enterprise`'s `verify-layer.mjs` derives from exactly that grep which SDK packages its layer must install, and had to special-case `__tests__` to avoid demanding a test framework in production. Downstream tooling reads an artifact's contents as a statement about it, and works around the parts that are not true.

**What worked**: three configs with three jobs. `tsconfig.json` stays the project — `src/**`, tests included — because it is what an editor and `npm run typecheck` use. `tsconfig.build.json` extends it and excludes `src/**/__tests__/**` plus `*.spec.ts` / `*.test.ts`; `build` points at it. `tsconfig.test.json` extends `tsconfig.json` and **not** the build config, which is the edge that bites: `exclude` is inherited through `extends`, so narrowing the base would have silently stopped type-checking the very files it was dropping from `dist`. Both halves were checked by breaking a type in `src/**/__tests__/` and in `test/`, and confirming `npm run typecheck` still fails on each.

**Rule**: **a config that decides what to type-check and a config that decides what to emit are different questions, and an app that answers them with one file has answered one of them by accident.** Which one is wrong is predictable: typecheck wants more files, an artifact wants fewer, so the shared config is always too wide for the build. Check by compiling, not by reading `exclude` — `tests/architecture/a-build-does-not-emit-test-files.test.ts` asks TypeScript itself (`ts.parseJsonConfigFileContent`) which files each build would emit, because a string match on a pattern that matches nothing passes exactly like a correct one.

**Rule for the measurement**: state the number that moved and the number that did not. "252 files and three unloadable devDependency imports gone; image size unchanged" is the honest result, and it is a better argument than the one that sounded better — the reason to do it is that other tools read the artifact, not that it is smaller.

**Applies to**: `apps/worker`, `apps/api` and `apps/mcp`, the three apps that emit a tsc `dist`. Next apps (`web`, `admin`) are exempt by construction — `next build` traces from entry points, so an unimported spec is never emitted, confirmed against the published images. A new tsc-built workspace needs the same split and belongs in the architecture test's list.

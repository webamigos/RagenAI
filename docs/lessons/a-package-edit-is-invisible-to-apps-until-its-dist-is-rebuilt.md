---
title: 'Running vitest directly instead of through turbo tests the app against the last built dist of a workspace package, not the source you just edited'
modules: ['web', 'api', 'admin']
areas: ['testing', 'architecture']
topics:
  [
    'monorepo',
    'turborepo',
    'workspace-packages',
    'vitest',
    'stale-build',
    'false-green',
  ]
---

# Running vitest directly instead of through turbo tests the app against the last built `dist` of a workspace package, not the source you just edited

**Context**: ADR-39's follow-up added a third value to `OrgVisibilityScope` in
`packages/platform-contracts`, so that a non-member resolves to `'none'`
instead of sharing the member scope. The change was two lines in
`src/roles/roles.ts`. The package's own tests passed. The app-side unit tests
passed. Then `apps/web/perf/access-control.test.ts`, which asks a real Postgres
who can reach which file, failed:

```
AssertionError: expected 'member' to be 'none'
  expect(outsider.scope).toBe('none');
```

The source said `'none'`. The assertion was right. Nothing was wrong with
either.

**Problem**: the two kinds of test resolve the package by two different paths.

- A test **inside** the package imports its subject relatively —
  `import { orgVisibilityScope } from '../roles/roles'` — so it compiles the
  source and sees an edit immediately.
- A test **in an app** imports `@ragenai/platform-contracts`, which resolves
  through the workspace symlink in `node_modules` to the package's
  `package.json`, whose `main` is `./dist/index.js`. It sees whatever was last
  written by `tsc -p tsconfig.json`.

So an unbuilt edit is invisible to every app, while the package's own suite
reports it as done. `turbo run build --filter=@ragenai/platform-contracts` was
the whole fix, and nothing in the failure pointed at it.

**This is normally impossible, which is why it is easy to walk into.**
`turbo.json` gives `test`, `typecheck` *and* `lint` a `dependsOn: ["^build"]`,
so anything run through turbo — `npm run verify` included — rebuilds dependency
packages first and can never see a stale `dist`. The trap is only reachable by
bypassing turbo, which is exactly what you do while iterating: `npx vitest run
<one file>`, or a suite with its own config like `vitest.perf.config.ts`.

The failing direction is the lucky one. A stale `dist` can equally make a test
**pass** that should fail — an assertion written against the new behaviour,
checked against the old code, is only green by coincidence, and a security
predicate is precisely where that coincidence is expensive.

**Rule**: after editing anything under `packages/`, run
`npx turbo run build --filter=@ragenai/<package>` before running an app test
directly. Or simply do not run app tests directly after a package edit — go
through turbo (`npm run web:test`, `npm run verify`), which orders the build
for you. If an app-side result contradicts the source you are looking at, check
`packages/<name>/dist/` before debugging the source: `grep` the built artefact
for the thing you just added.

**Applies to**: every `packages/*` workspace consumed by `apps/*` —
`platform-contracts`, `rag-core`, `storage`, `observability`, `vault-client`,
`litellm-client`, `env`. All of them are consumed via `main`/`types` pointing
at `dist`, so all of them behave this way. Not applicable to `apps/*` source
edits, which apps import by path alias and compile directly.

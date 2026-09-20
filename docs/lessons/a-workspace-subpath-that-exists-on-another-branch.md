---
title: "TS2307 on a workspace package's subpath has two causes a typo cannot explain: the dependency was never installed, or the subpath only exists on an unmerged branch"
modules: ['web', 'admin']
areas: ['architecture', 'testing']
topics: ['typescript', 'monorepo', 'workspace-packages', 'exports', 'stacked-prs', 'module-resolution', 'traceResolution']
---

# A workspace subpath that exists on another branch

**Context**: guardrails B2 added a loader and two adapters in `apps/web`,
importing types from the new workspace package. Declaring the dependency,
writing the code and running the module's own tests all went fine — 34 passing.
`npm run verify` then failed with three copies of one error:

```
src/features/guardrails/contracts/guardrail-runtime.types.ts(4,8): error TS2307:
  Cannot find module '@ragenai/guardrails/contracts' or its corresponding type declarations.
```

The package exists. `packages/guardrails/dist/contracts/guardrail.d.ts` exists.
`packages/guardrails/package.json` names the subpath in `exports`. The
specifier is spelled correctly. Every obvious reading of the error is wrong.

**Problem**: two independent causes, and they produce a byte-identical message.

**One — the dependency was declared but never installed.** Adding
`"@ragenai/guardrails": "*"` to `apps/web/package.json` creates no
`node_modules/@ragenai/guardrails` symlink on its own, and neither does
`npm install --package-lock-only`. The package's own tests keep passing because
they import relative paths inside the package. Only a consumer resolving the
bare specifier notices, and `turbo run typecheck` is usually the first thing to
try.

**Two — the subpath only exists on a branch you are not on.** The `exports` map
containing `./contracts` was added in a *different, unmerged* pull request. This
branch was stacked on an intermediate branch taken from `origin/main`, which has
neither. So `exports` genuinely did not exist in the package.json being
resolved, and TS fell back to the root `types` field — which is what made the
error unintuitive rather than obvious.

`--traceResolution` is what separates them, and it is worth running before
theorising:

```
npx tsc --noEmit --traceResolution | grep -A12 "@ragenai/guardrails/contracts"
```

The decisive line in cause two is an *absence*: no mention of `exports` at all,
followed by

```
'package.json' has 'types' field './dist/index.d.ts' that references
  '.../node_modules/@ragenai/guardrails/contracts/dist/index.d.ts'
```

TS never consulted the `exports` map, because there was none to consult. In
cause one the trace stops earlier, at the package directory not existing.

**Rule**:

1. **Run `--traceResolution` before reasoning about a TS2307 on a bare
   specifier.** It distinguishes "package not linked" from "condition not
   matched" from "subpath not exported" in one read. Every one of those looks
   like a typo and none of them is.
2. **Adding a workspace dependency requires a real install**, with the npm
   `package.json` pins (`corepack npm`). `--package-lock-only` updates the
   lockfile and links nothing.
3. **A stacked branch does not inherit a sibling PR's package surface.** Before
   depending on an `exports` subpath, a new export or a new field added in
   another open PR, check it is on the branch you actually stacked on — `git
   show <branch>:packages/<pkg>/package.json` answers it in one command. The
   fix here was better than waiting: the three importing files are server-side,
   so the barrel was the right entry for them anyway, and using it removed the
   cross-PR dependency.

**Applies to**: any new import of a `@ragenai/*` workspace package from an app;
any stacked branch that depends on a package change from another open PR; any
package that grows an `exports` map, since adding one narrows what resolves.

---
title: 'npm can refuse a new unscoped package name outright — and the three errors you hit first all blame something else'
modules: ['ragen-cli']
areas: ['dependencies']
topics:
  ['npm', 'publishing', 'package-names', 'typosquatting', 'auth', 'misleading-errors']
---

# npm can refuse a new unscoped package name outright — and the three errors you hit first all blame something else

**Context**: publishing `packages/ragen-cli` to npm for the first time, to claim
the unscoped name `ragen`. The tarball was built, installed globally from the
packed artifact and exercised (`--version`, `--help`, a planned command exiting
non-zero) before any publish was attempted, so the package itself was never in
question.

**Problem**: four attempts produced three different errors, and only the last
one described the actual obstacle.

1. `E403 — You may not perform that action with these credentials.` Read as
   "wrong token", which it was: the existing token was read-only.
2. `E404 — Not Found - PUT /ragen … 'ragen@0.1.0' is not in this registry.`
   Read as "the registry is confused", because publishing a *new* package is
   supposed to create it. In fact **an unauthenticated PUT to a name that does
   not exist returns 404, not 401** — the registry will not confirm what it
   does not let you see. Here the cause was a `~/.npmrc` line rewritten to
   `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` while the publishing shell
   had no `NPM_TOKEN` exported, so npm sent the literal placeholder. A granular
   token restricted to "only select packages" produces the identical 404, since
   it cannot create a name.
3. `E403 — Package name too similar to existing packages raven,hygen; try
   renaming your package to '@<user>/ragen'.` The real answer, and it has
   nothing to do with credentials: npm's similarity filter rejects the name for
   **everyone**, so the name was never available to lose.

The cost was about forty minutes spent on authentication, rotating a token and
working around a browser login — all of it irrelevant to the outcome.

**Rule**: before building anything around an unscoped npm name, publish a
throwaway `0.0.1` under it — that is the only check there is. `npm view <name>`
returning 404 means *unclaimed*, not *obtainable*, and **`npm publish --dry-run`
does not consult the filter either**. Measured here against the refused name:

```
$ npm publish --dry-run --access public     # package.json says "name": "ragen"
+ ragen@0.0.1
exit 0
```

A dry run never asks the registry whether the name is allowed, so it reports
success for a name that cannot be published. The community tool `can-i-publish`
works by attempting a real publish probe, which is the same admission. Treat a
404 on `PUT` as an authentication answer, never as a statement about the
package. When the filter does fire, a scoped name
(`@scope/thing`) bypasses it entirely, and `bin` is independent of `name`, so
the command a user types need not change — only the install line.

The corollary worth keeping: a name the filter blocks cannot be squatted by
anyone else either. If urgency to claim a name is the reason to cut a corner —
publishing ahead of a merge, skipping a review — that urgency evaporates the
moment the filter is what is standing in the way.

**Adjacent trap, same session**: `npm login --browser="open -a Firefox"` opens
the *default* browser. npm 10.9.8 types `browser` as `Boolean | String` and
coerces any string given on the command line to `true`; the value survives only
from an `.npmrc` (`npm config set browser "open -a Firefox"`). `--browser=false`
does parse, and makes npm print the URL instead of opening anything, which is
the reliable escape hatch when the default browser is the wrong one.

**Applies to**: any first publish from this repository — `create-ragen-app`
predates this and was unaffected because its name is a phrase — and to
`packages/create-ragen-app`'s own release procedure, which assumes the name is
already held.

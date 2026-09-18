---
title: 'A transitive dependency can raise the Node floor inside a major, and `engine-strict` turns that into a failed install — while every check that claims to be about the Node version stays green'
modules: ['ci', 'create-ragen-app']
areas: ['dependencies', 'ci']
topics: ['node-version', 'engines', 'engine-strict', 'ebadengine', 'installer', 'first-run', 'false-green', 'architecture-tests']
---

# A transitive dependency can raise the Node floor mid-major

**Context**: a fresh `create-ragen-app` 0.6.1 install, run by hand on a machine
with Node 24.13.0 — the version `nvm install 24` produced for several weeks.
Every declared requirement in the repository said `>=24`, and CI was green.

**Problem**: `npm install` stopped with

```
npm error code EBADENGINE
npm error Not compatible with your version of node/npm: jsdom@30.0.1
npm error Required: {"node":"^22.22.2 || ^24.15.0 || >=26.0.0"}
npm error Actual:   {"node":"v24.13.0"}
```

`jsdom` is a transitive dependency; it narrowed its own range with no version
bump of ours, and `.npmrc` sets `engine-strict=true`, so npm stops instead of
warning. That is the intended behaviour — a hard stop beats a half-built tree —
but it means the real floor had moved to 24.15.0 while twenty-one `engines.node`
fields, the installer's own `checkNodeVersion`, and `.nvmrc` all still said 24.

The installer's guard exists precisely to refuse before anything is written. It
compared **majors**, so it cleared 24.13, cloned the repository, wrote
`.env.local`, started docker compose, and only then reached the failure. Thirty
seconds of setup and a half-configured directory, where the design was a refusal
in the first second.

Nothing in CI could see it. `actions/setup-node` with `node-version: 24`
installs the newest 24.x, which always satisfies whatever the floor happens to
be; the one job that deliberately tested an *unsupported* Node used 22, a
different major. So the only way to observe the bug was to be a stranger with an
older 24 pinned — which is the population the installer exists for.

There is a second half to the same mistake, found in review of the fix. The
first correction was `>=24.15.0` — right about the patch digit and still wrong,
because jsdom's range *skips the entire 25 line*. Odd-numbered Node releases
never become LTS and libraries routinely omit them, so a minimum version is the
wrong shape for the requirement no matter which number it holds: it cannot
express a gap. `>=24.15.0` would have cleared Node 25 and failed `npm install`
on it, reproducing the original bug with a newer version.

**Rule**: what a tree runs on is a **range**, not a floor, and it is stated
once. A bare major is a true statement about the release line and a false one
about the tree; a bare `>=` is a true statement about the oldest version and a
false one about everything above it. A dependency you did not choose can move
either end at any time. Concretely:

- `engines.node` carries the real range — today `^24.15.0 || >=26.0.0` — in the
  root and every workspace, and
  `tests/architecture/the-node-floor-is-one-number.test.ts` holds them, `.nvmrc`
  and the installer's own table to the same one. A workspace that deliberately
  differs (a published *client*, which runs before any install exists) has to
  say so in its own README, so an exemption cannot be a silent line in an array.
- `.nvmrc` carries the full version. `nvm use 24` selects whatever 24.x is
  already installed, which is how someone lands below the floor while believing
  they followed the instructions.
- A refusal message must say **why the patch digit matters**. "Needs Node 24"
  read by someone who has Node 24 is a riddle, and the likely conclusion is that
  the installer is broken.
- CI must pin real versions on **both** sides of every boundary: below the floor
  (24.14), inside a gap (25), and at the floor itself (24.15). A job on "latest
  major" cannot fail any of these ways and therefore proves nothing about them.
  Only npm, on an actual Node, can answer whether the declared range is true —
  an architecture test compares our declarations to each other and would hold
  twenty-one manifests in perfect agreement on a range a dependency has since
  moved beyond.

**Applies to**: `engines` fields anywhere in the monorepo, `.nvmrc`,
`packages/create-ragen-app`, and any CI job that selects a Node version.

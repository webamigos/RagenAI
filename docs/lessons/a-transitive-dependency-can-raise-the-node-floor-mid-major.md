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

**Rule**: a minimum Node is a **full version**, not a major, and it is one
number stated once. A bare major is a true statement about the release line and
a false one about the tree, because a dependency you did not choose can raise
the floor inside a major at any time. Concretely:

- `engines.node` names `major.minor.patch` in the root and every workspace, and
  `tests/architecture/the-node-floor-is-one-number.test.ts` holds them, `.nvmrc`
  and the installer's constant to the same value.
- `.nvmrc` carries the full version. `nvm use 24` selects whatever 24.x is
  already installed, which is how someone lands below the floor while believing
  they followed the instructions.
- A refusal message must say **why the patch digit matters**. "Needs Node 24"
  read by someone who has Node 24 is a riddle, and the likely conclusion is that
  the installer is broken.
- CI must pin the version *below* the floor as well as one above it. A job on
  "latest major" cannot fail this way and therefore proves nothing about it.

**Applies to**: `engines` fields anywhere in the monorepo, `.nvmrc`,
`packages/create-ragen-app`, and any CI job that selects a Node version.

---
title: 'A unit test that reads the runner’s own `process.version` passes in CI and fails on every developer below the required major'
modules: ['create-ragen-app']
areas: ['testing']
topics: ['node-version', 'unit-tests', 'environment-coupling', 'false-red', 'cli']
---

# A unit test that reads the runner's own `process.version` passes in CI and fails on every developer below the required major

**Context**: #1063 made `create-ragen-app` refuse to scaffold on a Node below
`REQUIRED_NODE_MAJOR` (24), before the clone, so the failure costs nothing.
`run()` reads the real `process.version` and hands it to `checkNodeVersion`.
`node-version.test.ts` covers the check itself by feeding it version strings;
`cli.test.ts` covers the wizard's flow — target directory, templates, prompts,
Docker, install — and calls `run()` directly.

**Problem**: every test in `cli.test.ts` that was not about the Node gate hit
the gate first. On a machine running Node 22 `run()` returned `false` before
cloning anything, so twelve assertions failed at once, all of them of the form
_expected "vi.fn()" to be called once, but got 0 times_ — `cloneRagenApp`,
`writeFileSync`, `startDockerServices` never called, in tests whose names are
about prompts and manifests and say nothing about Node. Nothing in the output
mentions a version. CI runs Node 24, so the suite was green there and red on
any developer machine that had not switched, which reads as an environment
quirk to shrug at rather than a defect in the test.

The same file already contained a `describe('on an unsupported Node')` block
that captured `const supported = process.version` at module load and restored
it afterwards — so on Node 22 its "restore" restored an _unsupported_ version,
and its three tests were the only ones in the file that passed.

**What we did**: `cli.test.ts` pins `process.version` to
`` `v${REQUIRED_NODE_MAJOR}.0.0` `` in `beforeEach` and restores the real one in
`afterEach`. The gate block's private helper is gone; it uses the same pin with
`` `v${REQUIRED_NODE_MAJOR - 1}.22.3` ``, derived from the requirement so that
raising it cannot quietly turn those tests into tests of a supported version.
No production code changed — the coupling was the test's.

## The same shape again, from the other direction (2026-09-16)

ADR-44 flipped the default worker runtime to BullMQ. `apps/api`'s
`jobs.service.spec.ts` stubbed the *Temporal* adapter and leaned on it being
the default, so the flip turned a wiring test into one that constructed a real
`BullMqJobRuntime` and opened a real connection.

It then failed **two different ways in two environments**, which is what makes
it worth recording next to the first case:

- on a developer machine with a Redis running, `queue.add()` resolved and the
  test failed on `expected "vi.fn()" to be called at least once` — a mock
  assertion that says nothing about Redis;
- in CI, with no Redis, it hung until `Test timed out in 5000ms`.

Neither message names the cause, and the two do not look like the same bug.
The fix was to stop depending on which runtime is default: stub both adapters
and name the one the case means.

**And the reason local `verify` did not catch it is worth more than the bug.**
`turbo run` stops scheduling when a task fails. The repo-wide guard task
(`//#test`) runs early and contains `config-reference-is-generated`, which is
*expected* red for anyone with a `ragen-docs` checkout on the wrong branch — so
on those machines `verify` halts there and **13 of 59 tasks never run at all**.
The summary says `45 successful, 59 total`, and the missing fourteen are easy
to read as cached.

Two tests were broken by the same default flip, in two apps. The first was
found by CI; the second — `apps/web`'s `libs/jobs` test, failing identically —
was found only by re-running with `npm run verify -- --continue`, which is what
turns a stop into a full report.

So: **when `verify` fails, note how many tasks ran, not only which one
failed** — and if the failure is one you expected, re-run with `--continue`
before believing the rest is green.


**Rule**: a unit test must not read the environment its runner happens to be
in. `process.version`, `process.platform`, `process.env.CI`, the system
timezone and `Date.now()` are all inputs, and a test that takes them from the
runner is asserting something different on every machine. Pin them. The tell is
a suite that is green in CI and red locally (or the reverse) with assertion
failures that never mention the thing that actually differs — which is also why
this one sat unfixed: a red that looks like _your machine_ gets worked around
rather than read.

And when a test deliberately manipulates such a global, it must set the value
it wants rather than restore what it found: `const supported = process.version`
is only true on a machine that already satisfies the requirement, which is the
assumption the gate exists to break.

**Applies to**: `packages/create-ragen-app`, and any test that calls a function
which reads process- or host-level state. `AGENTS.md` names Node 24 as the
repository's version, so any machine below it meets this — the node the agent
shell picks up is the usual one.

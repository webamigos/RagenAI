---
title: 'Declaring an app ESM breaks the three things tsc, eslint and jest cannot see — and two of them fail silently'
modules: ['api']
areas: ['architecture', 'dependencies']
topics: ['esm', 'commonjs', 'nodenext', 'opentelemetry', 'nestjs', 'ts-jest', 'silent-failure', 'architecture-tests']
---

# Declaring an app ESM breaks the three things tsc, eslint and jest cannot see — and two of them fail silently

**Context**: `apps/api` was CommonJS with `module: nodenext`, which already
demands a `.js` extension on every relative import — 821 of its 824 had one.
Adding `"type": "module"` therefore looked like a one-line change, and the diff
mostly was. The whole of the risk sat in behaviour no static check models.

**Problem**: four defects, all of which passed `tsc --noEmit`, `eslint` and 97
jest suites.

0. **Top-level await does not restore the ordering `require` had.** Rewriting
   `instrument.ts`'s `require()` calls as `await import()` fixed the loud
   failure and introduced a silent one. ESM evaluates main.ts's imports in
   order, but it does not _wait_ for an async one before evaluating the
   siblings: Nest, Prisma and `pg` finish loading while `instrument.ts` is
   still suspended, so `registerInstrumentations` patches modules that are
   already in memory. The CommonJS version never had this problem, because its
   `require` calls were synchronous. The fix is to preload the file —
   `--import ./dist/instrument.js` — so it runs to completion before the
   entry's graph is touched. Found in review, not by any check.

1. **`require()` typechecks in an ESM file and throws at runtime.**
   `@types/node` declares `require` as a global, so nothing static objects.
   `instrument.ts` called it fourteen times inside a `try`/`catch` that logs
   and continues — so the app would have booted with no traces, no metrics and
   no logs, reporting one line nobody reads. Five more call sites elsewhere
   were workarounds for the _opposite_ problem: while the app was CJS, an
   import statement resolved `@qdrant/js-client-rest` and `meilisearch` to
   their ESM builds while tsc emitted `require`, and a literal `require()` was
   how you landed on the matching build. ESM makes that workaround both wrong
   and impossible.
2. **OpenTelemetry's auto-instrumentation silently stops.**
   `registerInstrumentations` hooks CommonJS `require` calls, and the ESM
   loader never makes any. Without
   `--import @opentelemetry/instrumentation/hook.mjs` on the start command the
   SDK initialises, logs `OpenTelemetry initialized`, exports the spans it
   creates itself, and traces no HTTP, no Postgres and no Prisma. **There is no
   error at any level.** An empty trace view is indistinguishable from a quiet
   service, and the flag has to be present on every way the app starts — here
   `start:prod`, the Dockerfile `CMD` and `railway.toml`, three files nothing
   kept in step.
3. **A CommonJS dependency may expose no named exports.** Node's ESM loader
   detects a CJS module's exports by static analysis and misses plenty;
   `import { AES, enc } from 'crypto-js'` compiled and threw on first
   evaluation. `import pkg from 'x'; const { AES } = pkg;` is the fix.
4. **A stale jest cache hid the blast radius.** After the flip, 94 of 97 suites
   passed and only the 3 files touched in the same commit failed. That looked
   like "my edit broke three files". It was the reverse: ts-jest now emits ESM,
   jest's default runtime cannot require it, and the 94 were serving
   transform output cached from before the package had a `type`. With
   `--clearCache`, 97 of 97 failed.

**A probe that lies.** The first check of fix (1) was
`node -e "import('./dist/instrument.js')"`, which printed
`OpenTelemetry initialized` and looked like proof.

The mechanism is specific and worth naming exactly, because the obvious
explanation is wrong: a real CommonJS file gets `require` as a _module-scope_
binding, which an imported ESM module could never see. But `node -e` is not a
file — it puts `require` on **`globalThis`**, and globals are visible from every
module, ESM included. Verified in isolation on Node 24:

| how the ESM module is loaded                             | `require` inside it |
| -------------------------------------------------------- | ------------------- |
| `node -e "import('./mod.js')"`                           | **works**           |
| `node --input-type=module -e "await import('./mod.js')"` | `ReferenceError`    |
| `node mod.js`                                            | `ReferenceError`    |

So probe with `--input-type=module`, or by running the real entry point. A
`node -e` one-liner will tell you a broken module is fine.

**Rule**: an ESM flip is not finished when the build is green. Finish it by
**booting the built artifact** — the only check that catches interop — and by
grepping the whole app for `require(`, which typechecks everywhere it is wrong.
Where a failure is silent rather than loud, leave a tripwire behind:
`tests/architecture/esm-apps-keep-their-runtime-contract.test.ts` asserts the
app declares `"type": "module"`, that no shipping file calls `require()`, and
that all three start commands carry the OTel loader hook.

For the test suite, compiling _tests_ down to CommonJS through a dedicated
`tsconfig.spec.json` is the cheap and correct answer: it keeps every
`jest.mock` working, and typechecking still happens under the app's real ESM
settings because `npm run typecheck` runs tsc over the config that includes the
specs.

## The same bug where nobody flipped anything: `apps/web`

`apps/web` has been `"type": "module"` all along, and
`src/app/lib/utils/logger/index.ts` picked its implementation with
`require('./serverLogger')`. That works, because **webpack and Turbopack supply
a `require` inside an ESM module** — so every code path the bundler owns is
fine, and the file looks correct in review.

Nothing outside the bundler is fine. All eight scripts in
`apps/web/src/scripts/` run under plain `tsx`, and any one of them that reaches
this module died on import with `ReferenceError: require is not defined` before
a line of its own body ran. `clear-litellm-legacy-restrictions.ts` — written in
Phase A specifically to be run by hand — had never been runnable, and the
failure was doubly hidden: the server branch's throw landed in a `catch` that
read it as "serverLogger is unavailable", and the fallback then threw the same
way.

Fixed by guarding on `require` itself (`typeof require === 'function'`) and
statically importing the isomorphic client logger as the non-bundler path,
which was already the file's documented fallback. The `catch` now warns instead
of degrading in silence.

**Rule, restated for this case**: a bundler-only global is not a language
feature. If a module is reachable from anything run by `node`/`tsx` — a script,
a migration, a seed, an eval — then the bundler's `require` is not available
there, and no build, lint or test will tell you.

**Applies to**: `apps/api` today; `apps/worker` next, where the same three
classes apply on top of 499 extensionless imports and Temporal's own workflow
bundler. `apps/web` for anything reachable from `src/scripts/`. And to any
future `"type": "module"` flip in this monorepo.

# ADR-48: The Worker and API Test Suites Run on Vitest

**Status:** Accepted. Executed for `apps/worker` and `apps/api`, and extended to
`apps/mcp` on 2026-09-21 — see the update at the end. No workspace runs jest any
more.
**Date:** 2026-09-14

## Context

`apps/worker` and `apps/api` are ESM (`"type": "module"`, ADRs from #1164 and
#1166). Their test suites were not. Both ran on jest with `ts-jest`, and both
jest configs forced `module: 'commonjs'` in the transform — deliberately, so
that `jest.mock` kept intercepting the dynamic `import()` calls the sources use
for lazy initialisation. Downlevelling a dynamic import to `require()` is what
made that interception possible.

That trick has a hard limit: a CommonJS runtime cannot `require()` an
**ESM-only** dependency. AI SDK 7's dependency tree is ESM-only, so the upgrade
(B0c) stopped at the test runner rather than at any application code.

Two cheaper escapes were tried and both failed:

- **Widening `transformIgnorePatterns`.** It cascades. `@ai-sdk/mcp` pulls
  `@workflow/serde`, which pulls the next one, and the list never closes.
- **Transforming all of `node_modules`.** Does not help either — the packages
  are ESM-only, not merely untranspiled, so compiling them changes nothing
  about `require` refusing to load them.

The remaining options were to keep jest and abandon the upgrade, or to run the
suite as what the app already is.

## Decision

Run the suites on **Vitest**. The runner and the runtime then agree: both are
real ESM, so a dynamic `import()` needs no downlevelling and an ESM-only
dependency loads natively.

Keep jest's injected globals (`globals: true`). The migration is then a rename
of the mocking API and nothing else — no import line added to 96 files.

## Consequences

Five jest behaviours have no Vitest equivalent, and each one produced a real
failure during the worker migration:

| jest                                                         | Vitest          | Why                                                                                                                                     |
| ------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| a `jest.mock` factory may close over a `const` named `mock*` | it may not      | jest exempted the `mock` prefix; Vitest has no exemption — use `vi.hoisted()`                                                           |
| `jest.fn(() => ({...}))` is constructible                    | it is not       | an arrow has no `[[Construct]]`; a mocked constructor must be a `function` or `class`                                                   |
| a mock object satisfies `import x from 'y'`                  | it does not     | CommonJS interop supplied the default; real ESM reads `default` literally                                                               |
| a top-level statement runs before the imports below it       | it does not     | ESM hoists imports above plain statements, so anything a module reads at load time (a `process.env` flag) must be set in `vi.hoisted()` |
| `fail()`                                                     | `expect.fail()` | not a Vitest global                                                                                                                     |

The fourth is the one to watch, because it is the only one that fails
_silently_ rather than as an error: a feature flag read at module load comes
back `false`, and the test then asserts against a disabled code path while
looking like it passed for the right reason.

`moduleNameMapper` also has no equivalent, which is a net gain — the two manual
mocks that existed only as mapper targets (`franc`, `@qdrant/js-client-rest`)
are gone, and each mock now sits beside the test that configures it.

The worker's Presidio integration suite keeps a separate config, as it did
under jest, so `npm test` never depends on Docker being up.

### NestJS needs SWC, not esbuild

`apps/api` has one constraint the worker does not. Vite's default transformer is
esbuild, which does not implement `emitDecoratorMetadata` — it strips the types
a decorator's metadata is derived from. Nest resolves constructor injection from
exactly that metadata, so under esbuild a provider whose constructor parameter
carries no explicit `@Inject` fails to resolve at `compile()` time.

Both of the app's vitest configs therefore run the suite through SWC
(`unplugin-swc`), which implements it. The transform is swapped rather than the
tsconfig relaxed, because the metadata is what production depends on too.
`chat/chat.module.wiring.spec.ts` compiles the whole `AppModule` and is the test
that catches a regression here.

### Both suites reproduce their jest numbers exactly

|               | suites  | tests     |
| ------------- | ------- | --------- |
| `apps/worker` | 56 → 57 | 596 → 598 |
| `apps/api`    | 97      | 1155      |

The worker's extra suite is a new test for `src/workflows-path.ts`, extracted
during the migration. `apps/api` is unchanged in both columns: same tests, same
count, different runner.

One pre-existing failure surfaced rather than being caused. `apps/api`'s single
e2e spec was already red under jest — nothing in CI runs it — for two reasons:
`ConfigModule` looks for an env file beside the app while the monorepo keeps one
at the root, and `createNestApplication()` does not replay `main.ts`'s
`setGlobalPrefix('v1')`, so every request 404'd. Both are fixed.

## Update: `apps/mcp` followed, and jest is gone from the repository

**Date:** 2026-09-21.

This ADR's title states its scope, and `apps/mcp` was outside it: the app is
self-contained, does not touch the AI SDK, and so had none of the forcing
function above. It kept jest — and then kept it long enough to be the only
workspace in the monorepo running a second framework.

What made it worth finishing was not the runner. `ci.yml` runs
`turbo run test`, which picks up any workspace declaring a `test` script, so
jest and its transform chain were installed and executed on every pull request
for one workspace — while `turbo run test:coverage` never saw it, so its
coverage was counted nowhere and repo-wide vitest config changes skipped it.
Two sets of mocking idioms, two config surfaces to carry across a TypeScript or
Node bump, and one directory where a contributor's `vi.mock` would have done
nothing at all.

The migration was the rename this ADR predicted — `jest.fn`, `jest.mock`,
`jest.resetModules` — plus the `import type` line the mock *types* need, in
the seven suites of twelve that use them. `jest.Mock`, `jest.Mocked` and
`jest.MockedFunction` were ambient under jest and are exports of `vitest`, so
the Decision's "no import line added to 96 files" describes the injected
globals and not the types: `apps/worker` and `apps/api` carry the same import
in 31 and 48 files respectively.

None of the five traps in the table above fired: no factory closes over
a `mock*` const, no mocked constructor, no default-import interop, and the one
module-load-time read (`TARGET_ENV`, in what is now `vitest.setup.ts`) was
already in a setup file rather than a top-level statement. `jest.config.ts`'s
`moduleNameMapper` — stripping the `.js` from Node16 import specifiers so
ts-jest's CommonJS transform could resolve them — has no equivalent and needs
none: Vite resolves a `.js` specifier from a TypeScript importer to the `.ts`
file itself.

Not one `describe`, `it` or `it.each` line changed in the port — the diff is
the mocking API and the imports it needs — and the suite reports 12 files and
79 tests passing. That is the parity claim this section makes: the same set of
test declarations, rather than two totals compared after the fact.

No `vite-tsconfig-paths` here, unlike `apps/web` and `apps/admin` — this
workspace's tsconfig declares no `paths`, so the plugin would have nothing to
read.

Two things beyond the app came with it:

- **`tests/architecture/one-test-runner-for-every-workspace.test.ts`** fails
  when any manifest declares part of jest, when a `test*` script invokes it, or
  when a `jest.config.*` is left behind. `@testing-library/jest-dom` and
  `jest-axe` are named exemptions — matcher libraries with a Vitest entry
  point, which `apps/web` uses under Vitest.
- **`tsconfig-types-are-installable`** now checks `apps/mcp`. Its Dockerfile
  has always installed scoped, so the app was always in that guard's scope and
  was never in its candidate list — and this change is exactly the edit the
  guard exists for: `"jest"` out of `types`, `"vitest/globals"` in.

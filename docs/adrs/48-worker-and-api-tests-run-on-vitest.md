# ADR-48: The Worker and API Test Suites Run on Vitest

**Status:** Accepted for `apps/worker`. `apps/api` is the same decision, not yet executed.
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

`apps/api` still runs jest. Nothing about this decision is worker-specific; it
has simply not been done yet, and B0c stays blocked until it is.

# ADR-48: The Worker and API Test Suites Run on Vitest

**Status:** Accepted. Executed for `apps/worker` and `apps/api`.
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

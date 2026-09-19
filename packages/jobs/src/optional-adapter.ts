import type { JobRuntime } from './runtime-contract';

/**
 * The adapter this repository does not contain.
 *
 * `@ragenai/jobs-temporal` lives in
 * [`webamigos/ragen-enterprise`](https://github.com/webamigos/ragen-enterprise)
 * since the worker-runtime spec's G3. Nothing here depends on it, and the two
 * declarations below are what let an application load it anyway when an install
 * has put it there — the type side and the specifier, in the seam rather than
 * copied into each app.
 *
 * **The specifier is a constant and not a literal at the call site, and that is
 * the whole point of it being here.** TypeScript resolves the specifier of a
 * dynamic import when it is written as a string literal, whatever the runtime
 * branch does — so `await import('@ragenai/jobs-temporal')` fails
 * `tsc --build` on a default install with `TS2307`, which is the error G3 had
 * to get rid of rather than suppress. Passing an identifier makes the import
 * `Promise<any>`, which is why `TemporalAdapterModule` exists to cast it back
 * to something checked.
 */
export const TEMPORAL_ADAPTER_PACKAGE = '@ragenai/jobs-temporal';

/**
 * What the seam needs of that module, described rather than imported.
 *
 * It is deliberately the *narrowest* true statement: a constructor returning a
 * `JobRuntime`. Production passes no options — the adapter reads
 * `TEMPORAL_SERVER_ADDRESS` itself — so `Options` defaults to `void` and the
 * seam states nothing it cannot check.
 *
 * `Options` is a parameter rather than a shape written out here because the one
 * caller that wants options is the parity harness, and what it passes is a
 * `Client` from `@temporalio/client` — a type this package has no access to and
 * must not acquire. The harness supplies it, because the harness is where those
 * types already are; re-stating the adapter's options here would be the
 * hand-synced copy [ADR-33](../../../docs/adrs/33-shared-platform-contracts-package.md)
 * exists to prevent.
 */
export interface TemporalAdapterModule<Options = void> {
  TemporalJobRuntime: new (options?: Options) => JobRuntime;
}

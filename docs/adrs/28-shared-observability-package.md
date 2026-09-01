# ADR-28: Share the OTel Logger and Span Helper Across the Apps

**Status:** Accepted and implemented.
**Date:** 2026-09-01

## Context

After ADR-26 and ADR-27 collapsed the vector contract and the storage
abstraction into shared packages, the observability helpers were the remaining
copy-paste of any size:

| File | Copies | Differs only in |
|---|---|---|
| `otel-logger.ts` | **3** — ragen-app, apps/api, apps/worker | the instrumentation scope name, brace style, and one private function's name |
| `withSpan` + tracer setup | **2** — ragen-app `monitoring/with-span.ts`, apps/api `telemetry/telemetry.ts` (48 lines each) | the fallback service name, and that apps/api also exposes a `meter` |

ragen-app's `with-span.ts` even carried a comment saying it *"mirrors
`withSpan()` in ragen-api ... so spans from the two services read the same way
in a trace waterfall"* — a hand-maintained mirror, documented as such, which is
the same pattern ADR-26 found in `bm25-encoder.ts`.

One genuine inconsistency had already crept in: ragen-app's logger honoured
`OTEL_SERVICE_NAME`, while the worker's and apps/api's hardcoded their scope
name. (Their SDK setup in `instrument.ts` / `telemetry.ts` does read the env var
for the *resource* service name, so this only affected the logger's
instrumentation scope — a smaller problem than it first looks, but still two
behaviours where there should be one.)

## Decision

**`packages/observability`**, on the same model as `packages/rag-core` and
`packages/storage`: a CommonJS build with declarations, so a `tsc --build` →
plain-node consumer can use it.

It exports two factories, both taking the service name as their one parameter:

- `createOtelLogger(defaultScopeName)` → `{ debug, info, warn, error }`
- `createTelemetry(defaultServiceName)` → `{ tracer, meter, withSpan }`

`OTEL_SERVICE_NAME` overrides the default in both, which is what ragen-app
already did and what the other two should have been doing.

Each app keeps a small binding file that names itself and re-exports, so **no
import site changed** — five files that were implementations became five files
that are one line of configuration each.

### Why this is lower-stakes than ADR-26 and ADR-27

Worth stating plainly, so the ordering makes sense: divergence here costs
inconsistent log formatting or an oddly-scoped span. It does not silently
degrade retrieval (ADR-26) or lose files (ADR-27). That is why this waited, and
why it is a small ADR.

### `withSpan` is a property, not a method

`Telemetry.withSpan` is declared as a property with a function type rather than
a method shorthand. Consumers re-export it standalone
(`export const withSpan = telemetry.withSpan`), which
`@typescript-eslint/unbound-method` rejects for a method signature. It captures
nothing from `this`, so the property form is also the more honest description.

## Consequences

### Positive

- Five files collapse to one implementation with 20 tests, where previously the
  only coverage was ragen-app's `with-span.test.ts` — the worker's and apps/api's
  copies had none.
- `OTEL_SERVICE_NAME` now behaves identically in all three.
- The `packages/*` coverage gap closed at the same time: vitest ran package
  tests but measured no coverage for them, so this shared code reported nothing.

### Negative

- A fourth workspace package.
- The binding files are thin enough that their tests assert little more than a
  constant. They are kept because that constant is the only thing the binding
  does, and a wrong scope name is invisible until someone goes looking for logs
  that were filed under another service.

## Out of scope

- **The main `logger`.** ragen-app's is a four-file client/server pair that
  webpack swaps at build time for browser bundles; the worker's is plain server
  pino. Sharing those would drag Next-specific concerns into a worker
  dependency for no gain.
- **`instrument.ts` / SDK bootstrap.** Each app configures its own exporters and
  auto-instrumentation, and they legitimately differ.
- **`langfuse-trace.ts`** (worker-only) — no second copy to converge with.

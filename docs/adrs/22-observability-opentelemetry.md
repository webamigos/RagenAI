# ADR-22: Observability with OpenTelemetry

**Status:** Accepted
**Date:** 2026-08-31

## Context

Both ragen-app and ragen-api ship an OpenTelemetry setup — `src/instrumentation.ts` → `src/instrumentation.node.ts` in ragen-app, `src/instrument.ts` in ragen-api — wiring traces, metrics and logs through OTLP/HTTP. An audit of what that setup actually captured found it was close to inert:

1. **Nothing was exported anywhere.** Every provider is gated on `OTEL_EXPORTER_OTLP_ENDPOINT`, which is empty or commented out in every `.env.example`, and no compose file in `ragen-app` or `ragen-deploy` ever provided a collector. Locally, spans were created and silently dropped — there wasn't even a console exporter as a fallback. A developer had no way to see a trace without first standing up their own backend.
2. **Outgoing HTTP was invisible.** `HttpInstrumentation` only patches Node's core `http`/`https`. Every outgoing call either app makes — LiteLLM, Qdrant, S3, ragen-vault, ragen-mcp, and ragen-api ↔ ragen-app — goes through the global `fetch` (undici). None of them produced spans, and because trace context was never propagated over those calls, a request crossing the two services appeared as two unrelated traces.
3. **No business-logic spans existed.** A grep for `getTracer`/`startSpan` outside the SDK bootstrap returned nothing in ragen-app. ragen-api had a `withSpan()` helper in `src/telemetry/telemetry.ts` with zero call sites.
4. **ragen-api had no database instrumentation**, despite the DB being central to its work and ragen-app having had Prisma and Pg instrumentation all along.

Separately, LLM call tracing is handled by the LiteLLM proxy via Langfuse callbacks (see ADR-04) and app-level Langfuse tracing lives in `assistant-stream.ts`. That is a **different pipeline** from the OTel one described here, and this ADR does not change it.

## Decision

### 1. Telemetry stays opt-in, and that is deliberate

`OTEL_EXPORTER_OTLP_ENDPOINT` remains the single switch. With it unset, the global tracer stays the API's no-op implementation and the whole system costs effectively nothing. Self-hosted and local deployments should not have to run or configure a telemetry backend to use Ragen — this is the same reasoning as ADR-24's stance on Presidio.

### 2. A local collector stack, behind an opt-in compose profile

`docker compose --profile observability up -d` starts an OTel Collector (OTLP gRPC 4317, HTTP 4318) and Jaeger (UI on 16686). The collector accepts all three signals and fans traces out to Jaeger, with everything also going to its own log.

The profile is **not** started by `docker compose up`, so default onboarding is unchanged. The collector config (`otel/collector-config.yaml`) is the documented place to add a real backend (Grafana Cloud, Honeycomb, …) by adding an exporter and listing it in the pipelines.

### 3. Auto-instrumentation baseline, identical in both services

`http`, `undici`, `pg` and `prisma`. The undici instrumentation carries an `ignoreRequestHook` that skips requests to the collector's own origin, so the exporter's traffic doesn't feed telemetry back into itself. The collector origin is parsed once at startup, so the hook is a string compare and a malformed endpoint can't throw on every outgoing request.

### 4. Manual spans only where they add meaning the automatic ones lack

Auto-instrumentation already answers "what HTTP calls and queries happened". Manual spans are reserved for places where the _semantics_ aren't recoverable from that:

| Span                                                 | Why it isn't redundant                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rag.retrieve` (+ nested `rag.rerank`)               | Records how many documents were retrieved, survived dedupe, and made the final cut — the numbers you need to explain a bad answer                                                                                                                       |
| `vector_store.similarity_search`                     | Records whether the BM25 half actually contributed; a query with no sparse signal silently degrades to dense-only, previously undetectable                                                                                                              |
| `vault.storeToken` / `retrieveToken` / `deleteToken` | Wrapped at the **public** methods, not the private `request()`: a 404 means "no token stored", which `retrieveToken` treats as a normal result. Tracing here keeps that an OK span instead of recording an exception for every user without a connector |
| `api_key.validate` / `api_key.revoke`                | On the hot path of every authenticated request; groups the vault round-trip and the timing-safe compare into one operation with a valid/invalid outcome                                                                                                 |

Child spans are placed _inside_ fan-out stages rather than around a `Promise.all`, so parallel work still reads as parallel in the waterfall.

Correspondingly, these are **not** wrapped: `streamText` and `rephraseAndExpand` already carry the AI SDK's `experimental_telemetry` and would be double-counted, and `RagenAppClient.request` is already covered by the undici span.

### 5. What is deliberately never recorded

- **Query and message text.** It is user content and would end up in the telemetry backend.
- **The vault `customerId`.** It embeds org and user IDs; the provider name is enough to make a span readable.

### 6. `withSpan()` is duplicated, not shared

Each service has its own helper (`ragen-app: src/libs/monitoring/with-span.ts`, `ragen-api: src/telemetry/telemetry.ts`) with the same shape, so spans from the two read the same way in one waterfall. There is no shared package infrastructure between them today, and this follows the existing convention of small duplicated files across the two codebases.

## Consequences

### Positive

- **A developer can see traces in about a minute** — one compose command and one env var, with no external account.
- **Cross-service traces actually connect.** With undici instrumented, trace context propagates over `fetch`, so a request through ragen-api into ragen-app is one trace.
- **The RAG pipeline is explainable.** Retrieval counts and the hybrid/dense-only distinction are visible per request.
- **Zero cost when off**, which keeps self-hosting simple.
- **Symmetric coverage** between the two services, removing the ragen-api database blind spot.

### Negative

- **Still no default production backend.** Deployments must point `OTEL_EXPORTER_OTLP_ENDPOINT` at something themselves; nothing in the repo prescribes which. This is intentional but means production observability is not automatic.
- **Two more images to pull** for anyone using the profile (collector + Jaeger), and Jaeger all-in-one stores traces in memory, so they are lost on restart. Acceptable for local development; not a production configuration.
- **Manual spans are a maintenance surface.** They can drift from the code they describe. Mitigated by unit tests asserting the span names and attributes.
- **Coverage remains partial.** Document ingest largely lives in `ragen-worker` and is untraced, and `ChatService.chat` in ragen-api has no span because its SSE streaming tail outlives the promise `withSpan` awaits — wrapping it would close the span early and misreport duration.

## Key files

| File                                                 | Purpose                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `ragen-app: src/instrumentation.node.ts`             | SDK bootstrap, exporters, auto-instrumentation registration |
| `ragen-app: src/instrumentation-client.ts`           | Browser tracing (document load, interactions, Web Vitals)   |
| `ragen-app: src/libs/monitoring/with-span.ts`        | Manual-span helper                                          |
| `ragen-app: src/libs/chains/basic-rag/operations.ts` | `rag.retrieve` / `rag.rerank`                               |
| `ragen-app: src/libs/vector-store/qdrant-client.ts`  | `vector_store.similarity_search`                            |
| `ragen-app: otel/collector-config.yaml`              | Collector pipelines; where to add a real backend            |
| `ragen-app: docker-compose.yml`                      | `observability` profile (collector + Jaeger)                |
| `ragen-api: src/instrument.ts`                       | SDK bootstrap; must be the first import in `main.ts`        |
| `ragen-api: src/telemetry/telemetry.ts`              | `withSpan()`, tracer, meter                                 |
| `ragen-api: src/vault/vault.client.ts`               | `vault.*` spans                                             |
| `ragen-api: src/common/services/api-keys.service.ts` | `api_key.*` spans                                           |

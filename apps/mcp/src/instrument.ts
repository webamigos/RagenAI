/**
 * OpenTelemetry initialization — MUST be the first import in `index.ts`, so
 * that this module and everything it pulls in evaluate before `fastmcp` and
 * before any outgoing `fetch` call exists to instrument.
 *
 * Everything here is skipped when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset,
 * which is the normal local case — the global tracer/meter/logger providers
 * then stay the API's built-in no-ops and `withSpan`/`otelLogger` cost
 * nothing (ADR-22).
 *
 * Unlike apps/api's and apps/worker's equivalents this uses plain static
 * ESM imports rather than `require()`: apps/mcp is a real ESM app
 * (`"type": "module"`, `module: Node16`), and ESM evaluates a module's
 * imports depth-first in source order, which gives the same
 * "instrument before anything else" guarantee without the interop dance.
 */
import { metrics } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from '@opentelemetry/sdk-trace-node';

import { resolveServiceName } from './telemetry/service-name.js';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = resolveServiceName();

if (endpoint) {
  try {
    const resource = resourceFromAttributes({
      'service.name': serviceName,
      'service.version': process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
      'deployment.environment.name': process.env.TARGET_ENV ?? 'local',
    });

    // Traces
    const tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
        ),
      ],
    });
    tracerProvider.register();

    // Metrics
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
          exportIntervalMillis: 30_000,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(meterProvider);

    // Logs — the sink behind `otelLogger`, which src/logger.ts feeds from pino.
    const loggerProvider = new LoggerProvider({
      resource,
      processors: [
        new BatchLogRecordProcessor(
          new OTLPLogExporter({ url: `${endpoint}/v1/logs` }),
        ),
      ],
    });
    logs.setGlobalLoggerProvider(loggerProvider);

    // Parsed once so the undici ignore hook below stays a cheap string
    // compare and a malformed endpoint cannot throw on every outgoing
    // request. Same reasoning as apps/api's instrument.ts.
    let collectorOrigin: string | undefined;
    try {
      collectorOrigin = new URL(endpoint).origin;
    } catch {
      // eslint-disable-next-line no-console -- the logger's OTel sink is what is being set up here
      console.warn(
        '[otel] OTEL_EXPORTER_OTLP_ENDPOINT is not a valid URL:',
        endpoint,
      );
    }

    registerInstrumentations({
      tracerProvider,
      meterProvider,
      instrumentations: [
        // Incoming: the httpStream transport's /mcp and /health requests.
        new HttpInstrumentation(),
        // Outgoing: every call this server makes to apps/api goes through
        // the global fetch (undici), which HttpInstrumentation does not
        // patch. Without this the tool-call spans have no HTTP child and —
        // more importantly — no traceparent header goes out, so a trace
        // stops dead at the apps/mcp → apps/api boundary instead of showing
        // one waterfall across both services.
        new UndiciInstrumentation({
          // Don't trace the exporter's own calls to the collector: that
          // would feed telemetry back into itself.
          ignoreRequestHook: (request) =>
            collectorOrigin !== undefined && request.origin === collectorOrigin,
        }),
      ],
    });

    let isShuttingDown = false;
    const shutdown = async (): Promise<void> => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      // allSettled, not all: one failing exporter must not stop the other
      // two from flushing whatever they still hold.
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ]);
    };

    const onShutdown = (): void => {
      void shutdown().finally(() => {
        process.exit(0);
      });
    };
    process.once('SIGTERM', onShutdown);
    process.once('SIGINT', onShutdown);

    // eslint-disable-next-line no-console -- runs before src/logger.ts is imported, by design
    console.log(`[otel] OpenTelemetry initialized, sending to ${endpoint}`);
  } catch (error) {
    // Telemetry setup failing must never take the MCP server down with it.
    // eslint-disable-next-line no-console -- as above
    console.error('[otel] Failed to initialize OpenTelemetry', error);
  }
}

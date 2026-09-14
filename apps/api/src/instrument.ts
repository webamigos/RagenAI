// OpenTelemetry initialization — MUST be imported before any other module.
// This file sets up tracing, metrics, and logs exporters via OTLP HTTP.
// Skipped entirely if OTEL_EXPORTER_OTLP_ENDPOINT is not set.
//
// The imports below are dynamic on purpose: this module is ESM (apps/api is
// `"type": "module"`), where `require` does not exist, and the whole block sits
// in a try/catch that would have swallowed the ReferenceError into a log line
// nobody reads. Top-level await keeps the ordering guarantee the comment above
// promises — `import './instrument.js'` in main.ts finishes before any later
// import in that file is evaluated.
//
// Patching itself needs one more thing under ESM: `registerInstrumentations`
// hooks CommonJS `require` calls, which the ESM loader does not make. The
// process must therefore start with
// `--import @opentelemetry/instrumentation/hook.mjs` — see this app's `start`
// script and Dockerfile. Without it the exporters below come up and report
// nothing.

const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const otelServiceName =
  (process.env.OTEL_SERVICE_NAME ?? '').trim() || 'ragen-api';

if (otelEndpoint) {
  try {
    const { NodeTracerProvider, BatchSpanProcessor } =
      await import('@opentelemetry/sdk-trace-node');

    const { OTLPTraceExporter } =
      await import('@opentelemetry/exporter-trace-otlp-http');

    const { OTLPMetricExporter } =
      await import('@opentelemetry/exporter-metrics-otlp-http');

    const { OTLPLogExporter } =
      await import('@opentelemetry/exporter-logs-otlp-http');

    const { MeterProvider, PeriodicExportingMetricReader } =
      await import('@opentelemetry/sdk-metrics');

    const { LoggerProvider, BatchLogRecordProcessor } =
      await import('@opentelemetry/sdk-logs');

    const { resourceFromAttributes } = await import('@opentelemetry/resources');

    const { metrics } = await import('@opentelemetry/api');

    const { logs } = await import('@opentelemetry/api-logs');

    const { HttpInstrumentation } =
      await import('@opentelemetry/instrumentation-http');

    const { UndiciInstrumentation } =
      await import('@opentelemetry/instrumentation-undici');

    const { PgInstrumentation } =
      await import('@opentelemetry/instrumentation-pg');

    const { PrismaInstrumentation } = await import('@prisma/instrumentation');

    const { registerInstrumentations } =
      await import('@opentelemetry/instrumentation');

    const resource = resourceFromAttributes({
      'service.name': otelServiceName,
      'service.version': process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
      'deployment.environment.name': process.env.TARGET_ENV ?? 'local',
    });

    // Traces
    const tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({ url: `${otelEndpoint}/v1/traces` }),
        ),
      ],
    });
    tracerProvider.register();

    // Metrics
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: `${otelEndpoint}/v1/metrics`,
          }),
          exportIntervalMillis: 30_000,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(meterProvider);

    // Logs
    const loggerProvider = new LoggerProvider({
      resource,
      processors: [
        new BatchLogRecordProcessor(
          new OTLPLogExporter({ url: `${otelEndpoint}/v1/logs` }),
        ),
      ],
    });
    logs.setGlobalLoggerProvider(loggerProvider);

    // Parsed once so the undici ignore hook below stays a cheap string compare
    // and a malformed endpoint can't throw on every outgoing request.
    let collectorOrigin: string | undefined;
    try {
      collectorOrigin = new URL(otelEndpoint).origin;
    } catch {
      console.warn(
        '[otel] OTEL_EXPORTER_OTLP_ENDPOINT is not a valid URL:',
        otelEndpoint,
      );
    }

    // Auto-instrumentations
    registerInstrumentations({
      tracerProvider,
      meterProvider,
      instrumentations: [
        new HttpInstrumentation(),
        // The DB is central to this service, but neither layer was traced.
        // PrismaInstrumentation gives operation-level spans; PgInstrumentation
        // gives the actual SQL, since @prisma/adapter-pg runs queries through
        // node-postgres.
        new PgInstrumentation(),
        new PrismaInstrumentation(),
        // HttpInstrumentation only patches Node's core http/https. Our
        // outgoing calls (apps/web chat proxy, token vault) use the global
        // fetch/undici, so without this those spans — and the cross-service
        // trace context — are missing.
        new UndiciInstrumentation({
          // Don't trace the exporter's own calls to the collector: that would
          // feed telemetry back into itself.
          ignoreRequestHook: (request: { origin: string }) =>
            collectorOrigin !== undefined && request.origin === collectorOrigin,
        }),
      ],
    });

    // Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      await Promise.all([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ]);
    };

    const onShutdown = () => {
      shutdown().catch((err) => {
        console.error('[otel] Shutdown failed', err);
        process.exit(1);
      });
    };
    process.once('SIGTERM', onShutdown);
    process.once('SIGINT', onShutdown);

    console.log(`[otel] OpenTelemetry initialized, sending to ${otelEndpoint}`);
  } catch (error) {
    console.error('[otel] Failed to initialize OpenTelemetry', error);
  }
}

// An empty export keeps this a module even when the block above is skipped.
export {};

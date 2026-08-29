/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// OpenTelemetry initialization — MUST be imported before any other module.
// This file sets up tracing, metrics, and logs exporters via OTLP HTTP.
// Skipped entirely if OTEL_EXPORTER_OTLP_ENDPOINT is not set.

const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const otelServiceName =
  (process.env.OTEL_SERVICE_NAME ?? '').trim() || 'ragen-api';

if (otelEndpoint) {
  try {
    const {
      NodeTracerProvider,
      BatchSpanProcessor,
    } = require('@opentelemetry/sdk-trace-node');

    const {
      OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-http');

    const {
      OTLPMetricExporter,
    } = require('@opentelemetry/exporter-metrics-otlp-http');

    const {
      OTLPLogExporter,
    } = require('@opentelemetry/exporter-logs-otlp-http');

    const {
      MeterProvider,
      PeriodicExportingMetricReader,
    } = require('@opentelemetry/sdk-metrics');

    const {
      LoggerProvider,
      BatchLogRecordProcessor,
    } = require('@opentelemetry/sdk-logs');

    const { resourceFromAttributes } = require('@opentelemetry/resources');

    const { metrics } = require('@opentelemetry/api');

    const { logs } = require('@opentelemetry/api-logs');

    const {
      HttpInstrumentation,
    } = require('@opentelemetry/instrumentation-http');

    const {
      registerInstrumentations,
    } = require('@opentelemetry/instrumentation');

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

    // Auto-instrumentations
    registerInstrumentations({
      tracerProvider,
      meterProvider,
      instrumentations: [new HttpInstrumentation()],
    });

    // Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) return;
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

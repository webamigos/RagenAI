/* eslint-disable no-console -- console is intentional here: the logger depends on OTL being initialised first, so we must use console during bootstrap */

const TARGET_ENV = process.env.TARGET_ENV;
const isProductionTarget = TARGET_ENV === 'production';
const isStagingTarget = TARGET_ENV === 'staging';

export async function register() {
  // Sentry init (production/staging only)
  if (isProductionTarget || isStagingTarget) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('../sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      await import('../sentry.edge.config');
    }
  }

  // OpenTelemetry init (any env with OTEL_EXPORTER_OTLP_ENDPOINT set)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    console.warn(
      '[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set, skipping OpenTelemetry init'
    );
    return;
  }

  try {
    const { NodeTracerProvider, BatchSpanProcessor } = await import(
      '@opentelemetry/sdk-trace-node'
    );
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );
    const { OTLPMetricExporter } = await import(
      '@opentelemetry/exporter-metrics-otlp-http'
    );
    const { OTLPLogExporter } = await import(
      '@opentelemetry/exporter-logs-otlp-http'
    );
    const { MeterProvider, PeriodicExportingMetricReader } = await import(
      '@opentelemetry/sdk-metrics'
    );
    const { LoggerProvider, BatchLogRecordProcessor } = await import(
      '@opentelemetry/sdk-logs'
    );
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { metrics } = await import('@opentelemetry/api');
    const { logs } = await import('@opentelemetry/api-logs');
    const { HttpInstrumentation } = await import(
      '@opentelemetry/instrumentation-http'
    );
    const { PgInstrumentation } = await import(
      '@opentelemetry/instrumentation-pg'
    );
    const { PrismaInstrumentation } = await import('@prisma/instrumentation');
    const { registerInstrumentations } = await import(
      '@opentelemetry/instrumentation'
    );

    console.log('[otel] All modules imported successfully');

    const resource = resourceFromAttributes({
      'service.name': 'ragen-app',
      'service.version': process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
      'deployment.environment.name': process.env.TARGET_ENV ?? 'local',
    });

    // Traces
    const traceExporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    });
    const tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [new BatchSpanProcessor(traceExporter)],
    });
    tracerProvider.register();
    console.log(
      '[otel] TracerProvider registered, exporting to',
      `${endpoint}/v1/traces`
    );

    // Metrics
    const metricExporter = new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
    });
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 30_000,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(meterProvider);
    console.log(
      '[otel] MeterProvider registered, exporting to',
      `${endpoint}/v1/metrics`
    );

    // Logs
    const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs` });
    const loggerProvider = new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor(logExporter)],
    });
    logs.setGlobalLoggerProvider(loggerProvider);
    console.log(
      '[otel] LoggerProvider registered, exporting to',
      `${endpoint}/v1/logs`
    );

    // Instrumentations
    registerInstrumentations({
      tracerProvider,
      meterProvider,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return (
              url.startsWith('/_next/') ||
              url.startsWith('/favicon') ||
              url.endsWith('.ico') ||
              url.endsWith('.png') ||
              url.endsWith('.jpg') ||
              url.endsWith('.svg') ||
              url.endsWith('.css') ||
              url.endsWith('.js') ||
              url.endsWith('.wasm') ||
              url.endsWith('.woff2')
            );
          },
        }),
        new PgInstrumentation(),
        new PrismaInstrumentation(),
      ],
    });
    console.log('[otel] Instrumentations registered (HTTP, PG, Prisma)');

    const shutdown = async () => {
      console.log('[otel] Shutting down providers...');
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ])
        .then((results) => {
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              const providerName = [
                'TracerProvider',
                'MeterProvider',
                'LoggerProvider',
              ][index];
              console.error(
                `[otel] ${providerName} shutdown failed:`,
                result.reason
              );
            }
          });
        })
        .finally(() => {
          process.exit(0);
        });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    console.log(
      `[otel] OpenTelemetry fully initialized, sending to ${endpoint}`
    );
  } catch (error) {
    console.error('[otel] Failed to initialize OpenTelemetry:', error);
  }
}

/**
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 *
 *
 * BELOW LINE WORKS ONLY WITH NEXT 15 AND SENTRY 8!
 *
 * Nested React Server Components
 * Prior to Next.js version 15, errors thrown in nested React Server Components were not exposed by the framework, preventing the SDK from capturing them.
 * Next.js 15 introduced an onRequestError hook in instrumentation.ts that allows capturing and reporting these errors.
 * Refer to Capturing Errors From Nested React Server Components for detailed setup instructions.
 */
// export const onRequestError = Sentry.captureRequestError;

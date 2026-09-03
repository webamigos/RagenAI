/* eslint-disable no-console -- console is intentional here: the logger depends on OTL being initialised first, so we must use console during bootstrap */

export async function registerOtel() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  console.log('[otel] OTEL_EXPORTER_OTLP_ENDPOINT =', endpoint);

  try {
    // OTLP HTTP exporters internally reference `navigator.userAgent` for
    // environment detection.  Next.js does not expose `navigator` in the
    // Node.js instrumentation context, so we provide a minimal shim to
    // prevent the ReferenceError.
    if (typeof globalThis.navigator === 'undefined') {
      // @ts-expect-error -- intentional minimal shim for OTLP exporters
      globalThis.navigator = { userAgent: '' };
    }

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
    const { PgInstrumentation } =
      await import('@opentelemetry/instrumentation-pg');
    const { UndiciInstrumentation } =
      await import('@opentelemetry/instrumentation-undici');
    const { PrismaInstrumentation } = await import('@prisma/instrumentation');
    const { registerInstrumentations } =
      await import('@opentelemetry/instrumentation');

    console.log('[otel] All modules imported successfully');

    // Parsed once so the undici ignore hook below stays a cheap string compare
    // and a malformed endpoint can't throw on every outgoing request.
    let collectorOrigin: string | undefined;
    if (endpoint) {
      try {
        collectorOrigin = new URL(endpoint).origin;
      } catch {
        console.warn(
          '[otel] OTEL_EXPORTER_OTLP_ENDPOINT is not a valid URL:',
          endpoint,
        );
      }
    }

    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'ragen-web';
    const resource = resourceFromAttributes({
      'service.name': serviceName,
      'service.version': process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
      'deployment.environment.name': process.env.TARGET_ENV ?? 'local',
    });

    // Span processors: OTLP when endpoint is set
    // Note: LLM call tracing is handled by LiteLLM proxy → Langfuse
    const spanProcessors: import('@opentelemetry/sdk-trace-node').SpanProcessor[] =
      [];

    if (endpoint) {
      const traceExporter = new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
      });
      spanProcessors.push(new BatchSpanProcessor(traceExporter));
    }

    const tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors,
    });
    tracerProvider.register();
    console.log('[otel] TracerProvider registered');

    let meterProviderInstance: InstanceType<typeof MeterProvider> | undefined;
    let loggerProviderInstance: InstanceType<typeof LoggerProvider> | undefined;

    if (endpoint) {
      // Metrics
      const metricExporter = new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
      });
      meterProviderInstance = new MeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: 30_000,
          }),
        ],
      });
      metrics.setGlobalMeterProvider(meterProviderInstance);
      console.log('[otel] MeterProvider registered');

      // Logs
      const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs` });
      loggerProviderInstance = new LoggerProvider({
        resource,
        processors: [new BatchLogRecordProcessor(logExporter)],
      });
      logs.setGlobalLoggerProvider(loggerProviderInstance);
      console.log('[otel] LoggerProvider registered');
    }

    // Instrumentations
    registerInstrumentations({
      tracerProvider,
      meterProvider: meterProviderInstance,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            const pathname = url.split('?')[0];
            return (
              pathname.startsWith('/_next/') ||
              pathname.startsWith('/favicon') ||
              pathname.endsWith('.ico') ||
              pathname.endsWith('.png') ||
              pathname.endsWith('.jpg') ||
              pathname.endsWith('.svg') ||
              pathname.endsWith('.css') ||
              pathname.endsWith('.js') ||
              pathname.endsWith('.wasm') ||
              pathname.endsWith('.woff2')
            );
          },
        }),
        new PgInstrumentation(),
        new PrismaInstrumentation(),
        // HttpInstrumentation only patches Node's core http/https. Every
        // outgoing call we make (LiteLLM, Qdrant, S3, ragen-vault, ragen-mcp,
        // ragen-api) goes through the global fetch/undici, so without this
        // those spans — and the cross-service trace context — are missing.
        new UndiciInstrumentation({
          // Don't trace the exporter's own calls to the collector: that would
          // feed telemetry back into itself.
          ignoreRequestHook: (request) =>
            collectorOrigin !== undefined && request.origin === collectorOrigin,
        }),
      ],
    });
    console.log(
      '[otel] Instrumentations registered (HTTP, PG, Prisma, undici)',
    );

    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      console.log('[otel] Shutting down providers...');
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProviderInstance?.shutdown() ?? Promise.resolve(),
        loggerProviderInstance?.shutdown() ?? Promise.resolve(),
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
                result.reason,
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

    console.log('[otel] OpenTelemetry fully initialized');
  } catch (error) {
    console.error('[otel] Failed to initialize OpenTelemetry:', error);
  }
}

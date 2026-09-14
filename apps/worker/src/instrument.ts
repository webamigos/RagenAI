import {
  NodeTracerProvider,
  BatchSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { metrics } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'ragen-worker';

const resource = resourceFromAttributes({
  'service.name': serviceName,
  'service.version': process.env.GIT_COMMIT_SHA ?? 'dev',
  'deployment.environment.name': process.env.TARGET_ENV ?? 'local',
});

const spanProcessors: SpanProcessor[] = [];

// Hoisted for graceful shutdown
let meterProvider: MeterProvider | undefined;
let loggerProvider: LoggerProvider | undefined;
let tracerProvider: NodeTracerProvider | undefined;

async function initLangfuse() {
  if (!process.env.LANGFUSE_SECRET_KEY) return;

  const { LangfuseSpanProcessor } = await import('@langfuse/otel');

  const langfuseSpanProcessor = new LangfuseSpanProcessor({
    shouldExportSpan: ({ otelSpan }) => {
      const scopeName = otelSpan.instrumentationScope.name;
      return (
        scopeName.includes('ai') ||
        scopeName.includes('openai') ||
        scopeName.includes('langfuse') ||
        scopeName.includes(serviceName)
      );
    },
    exportMode: 'immediate',
    environment: process.env.TARGET_ENV,
  });
  spanProcessors.push(langfuseSpanProcessor);
}

function initOtlp() {
  if (!endpoint) return;

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });
  spanProcessors.push(new BatchSpanProcessor(traceExporter));

  // Metrics
  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });
  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  // Logs
  const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs` });
  loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logExporter)],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
}

function registerProvider() {
  if (spanProcessors.length === 0) return;

  tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors,
  });
  tracerProvider.register();

  registerInstrumentations({
    tracerProvider,
    meterProvider,
    instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
  });

  const shutdown = async () => {
    await Promise.allSettled([
      tracerProvider?.shutdown(),
      meterProvider?.shutdown(),
      loggerProvider?.shutdown(),
    ]).finally(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Initialize: Langfuse (async due to ESM import), then OTLP, then register
export const instrumentationReady = initLangfuse().then(() => {
  initOtlp();
  registerProvider();
});

/**
 * Awaited at module scope so that preloading this file actually finishes the
 * job. `--import ./dist/instrument.js` waits for a module's evaluation,
 * top-level await included — but it would not wait for a promise merely
 * assigned to an export, and the point of the preload is that
 * `registerInstrumentations` runs before anything it means to patch is loaded.
 *
 * Without it the patching lands after `worker.ts`'s static imports have pulled
 * in the whole activity graph, `pg` and Prisma, and the exporters come up
 * reporting nothing — with no error to say so. The export stays, so
 * `worker.ts`'s own await remains correct (and, after the preload, a no-op).
 */
await instrumentationReady;

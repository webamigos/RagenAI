import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import {
  WebTracerProvider,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { UserContextSpanProcessor } from '@/libs/monitoring/otel-user-context';
import { initWebVitals } from '@/providers/Telemetry/web-vitals';
import { initErrorTracking } from '@/providers/Telemetry/error-tracking';

const COLLECTOR_URL = process.env.NEXT_PUBLIC_OTEL_COLLECTOR_URL;

if (COLLECTOR_URL) {
  const resourceAttrs: Record<string, string> = {
    'service.name': 'ragen-app-client',
  };
  const targetEnv = process.env.NEXT_PUBLIC_TARGET_ENV;
  if (targetEnv) {
    resourceAttrs['deployment.environment.name'] = targetEnv;
  }

  const resource = resourceFromAttributes(resourceAttrs);

  // Traces
  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new UserContextSpanProcessor(),
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${COLLECTOR_URL}/v1/traces` }),
      ),
    ],
  });

  provider.register({ contextManager: new ZoneContextManager() });

  // Logs
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: `${COLLECTOR_URL}/v1/logs` }),
      ),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new UserInteractionInstrumentation(),
    ],
  });

  initWebVitals();
  initErrorTracking();
}

export function onRouterTransitionStart(
  url: string,
  navigationType: 'push' | 'replace' | 'traverse',
) {
  if (!COLLECTOR_URL) {
    return;
  }

  const tracer = trace.getTracer('ragen-app-client');
  const span = tracer.startSpan('navigation', {
    attributes: {
      'page.url': url,
      'navigation.type': navigationType,
    },
  });

  const observer = new PerformanceObserver((list) => {
    observer.disconnect();
    const entries = list.getEntries();
    if (entries.length > 0) {
      span.setAttribute(
        'navigation.duration_ms',
        entries[entries.length - 1].startTime,
      );
    }
    span.end();
  });

  try {
    observer.observe({ type: 'paint', buffered: false });
  } catch {
    span.end();
  }

  setTimeout(() => {
    observer.disconnect();
    if (span.isRecording()) {
      span.end();
    }
  }, 10_000);
}

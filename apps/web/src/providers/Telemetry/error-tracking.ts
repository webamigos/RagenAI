import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ragen-web-client');

function recordError(
  message: string,
  attrs: Record<string, string>,
  originalError?: unknown,
) {
  const span = tracer.startSpan('client.error', { attributes: attrs });
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.recordException(
    originalError instanceof Error ? originalError : new Error(message),
  );
  span.end();
}

export function initErrorTracking() {
  const prevOnError = window.onerror;

  window.onerror = (message, source, lineno, colno, error) => {
    recordError(
      String(message),
      {
        'error.source': source ?? 'unknown',
        'error.lineno': String(lineno ?? ''),
        'error.colno': String(colno ?? ''),
        'page.url': window.location.pathname,
      },
      error,
    );

    if (typeof prevOnError === 'function') {
      prevOnError(message, source, lineno, colno, error);
    }
  };

  window.addEventListener('unhandledrejection', (event) => {
    const isError = event.reason instanceof Error;
    const message = isError ? event.reason.message : String(event.reason);
    recordError(
      message,
      {
        'error.type': 'unhandled_rejection',
        'page.url': window.location.pathname,
      },
      isError ? event.reason : undefined,
    );
  });
}

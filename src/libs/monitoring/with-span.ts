import {
  trace,
  SpanStatusCode,
  type Attributes,
  type Span,
} from '@opentelemetry/api';

const serviceName = (process.env.OTEL_SERVICE_NAME ?? '').trim() || 'ragen-app';

export const tracer = trace.getTracer(serviceName);

export { trace, SpanStatusCode };
export type { Attributes, Span };

/**
 * Wraps an async function in an OpenTelemetry span with automatic error
 * recording.
 *
 * When no OTLP endpoint is configured the global tracer is a no-op, so this
 * costs effectively nothing — see `src/instrumentation.node.ts`.
 *
 * Mirrors `withSpan()` in ragen-api (`src/telemetry/telemetry.ts`) so spans
 * from the two services read the same way in a trace waterfall.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      span.end();
    }
  });
}

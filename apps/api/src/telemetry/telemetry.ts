import {
  trace,
  metrics,
  SpanStatusCode,
  type Attributes,
} from '@opentelemetry/api';

export { trace, metrics, SpanStatusCode };
export type { Attributes };

const serviceName = (process.env.OTEL_SERVICE_NAME ?? '').trim() || 'ragen-api';
const tracer = trace.getTracer(serviceName);
const meter = metrics.getMeter(serviceName);

export { tracer, meter };

/**
 * Wraps an async function in an OpenTelemetry span with automatic error recording.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn();
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

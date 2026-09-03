import {
  trace,
  metrics,
  SpanStatusCode,
  type Attributes,
  type Meter,
  type Span,
  type Tracer,
} from '@opentelemetry/api';

export { trace, metrics, SpanStatusCode };
export type { Attributes, Span, Tracer, Meter };

export interface Telemetry {
  tracer: Tracer;
  meter: Meter;
  /**
   * Wrap an async function in a span, recording status and exceptions.
   *
   * When no OTLP endpoint is configured the global tracer is a no-op, so this
   * costs effectively nothing.
   *
   * Declared as a property with a function type rather than a method shorthand:
   * consumers re-export it standalone (`export const withSpan = t.withSpan`),
   * and a method signature makes @typescript-eslint/unbound-method reject that.
   * It captures nothing from `this`, so the property form is also honest.
   */
  withSpan: <T>(
    name: string,
    attributes: Attributes,
    fn: (span: Span) => Promise<T>,
  ) => Promise<T>;
}

/**
 * Build the tracer, meter and `withSpan` helper for one service.
 *
 * apps/web and apps/api carried identical 48-line copies of this that differed
 * only in the fallback service name — which is exactly the kind of duplication
 * that makes spans from the two services drift apart in a trace waterfall
 * (ADR-28). `OTEL_SERVICE_NAME` overrides the fallback, as it did in both.
 */
export function createTelemetry(defaultServiceName: string): Telemetry {
  const serviceName =
    (process.env.OTEL_SERVICE_NAME ?? '').trim() || defaultServiceName;
  const tracer = trace.getTracer(serviceName);
  const meter = metrics.getMeter(serviceName);

  async function withSpan<T>(
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

  return { tracer, meter, withSpan };
}

import { trace, SpanKind } from '@opentelemetry/api';

type LangfuseTraceOptions = {
  name: string;
  sessionId?: string;
  tags?: string[];
};

/**
 * Wraps an async function in an OTel span with Langfuse trace attributes.
 * AI SDK calls inside `fn` become child spans of this trace.
 */
export async function withLangfuseTrace<T>(
  options: LangfuseTraceOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('ragen-tracer');

  return tracer.startActiveSpan(
    options.name,
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('langfuse.trace.name', options.name);

      if (options.sessionId) {
        span.setAttribute('session.id', options.sessionId);
      }

      if (options.tags && options.tags.length > 0) {
        span.setAttribute('langfuse.trace.tags', options.tags);
      }

      try {
        return await fn();
      } catch (error) {
        span.setAttribute('langfuse.observation.level', 'ERROR');
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

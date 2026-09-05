import { SpanStatusCode, type Attributes } from '@ragenai/observability';

import { tracer } from './telemetry.js';

/**
 * The result shape every tool here produces: an MCP tool never throws on an
 * upstream failure, it returns a structured `{ success: false, ... }` payload
 * so the calling model can read what went wrong.
 */
export interface ToolOutcome {
  /** The JSON string handed back to the MCP client. */
  payload: string;
  /** Set when the tool could not do what it was asked. */
  failure?: { message: string; attributes?: Attributes };
}

/**
 * Wrap one MCP tool call in a span.
 *
 * Deliberately not ADR-28's shared `withSpan`: that one infers the span
 * status from whether the callback threw, which is the right rule almost
 * everywhere but not here. These tools report an upstream failure by
 * *returning* a `{ success: false }` payload — they never throw for it — so
 * under `withSpan` an apps/api 500 would produce a green span. This helper
 * takes the outcome explicitly instead, so a failed tool call is red in the
 * trace waterfall, which is the whole reason to have the span.
 */
export async function withToolSpan(
  toolName: string,
  attributes: Attributes,
  fn: () => Promise<ToolOutcome>,
): Promise<string> {
  return tracer.startActiveSpan(
    `mcp.tool ${toolName}`,
    { attributes: { 'mcp.tool.name': toolName, ...attributes } },
    async (span) => {
      try {
        const outcome = await fn();

        if (outcome.failure) {
          span.setAttributes(outcome.failure.attributes ?? {});
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: outcome.failure.message,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        return outcome.payload;
      } catch (error) {
        // Nothing in these tools is expected to throw — but if something
        // does, the span must not silently end as UNSET, and the exception
        // has to reach the trace before it propagates to FastMCP.
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

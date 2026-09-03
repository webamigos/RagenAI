/**
 * apps/web's tracer and span helper. Implementation shared via ADR-28 so spans
 * from apps/web and apps/api read the same way in a trace waterfall — they
 * used to be two identical 48-line copies that could drift apart.
 */
import { createTelemetry } from '@ragenai/observability';

const telemetry = createTelemetry('ragen-web');

export const tracer = telemetry.tracer;
export const withSpan = telemetry.withSpan;

export { trace, SpanStatusCode } from '@ragenai/observability';
export type { Attributes, Span } from '@ragenai/observability';

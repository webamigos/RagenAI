/**
 * apps/api's tracer, meter and span helper. Implementation shared via ADR-28.
 */
import { createTelemetry } from '@ragenai/observability';

const telemetry = createTelemetry('ragen-api');

export const tracer = telemetry.tracer;
export const meter = telemetry.meter;
export const withSpan = telemetry.withSpan;

export { trace, metrics, SpanStatusCode } from '@ragenai/observability';
export type { Attributes, Span } from '@ragenai/observability';

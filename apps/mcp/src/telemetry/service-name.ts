/**
 * The one place apps/mcp's OTel identity is spelled out.
 *
 * It is read by three modules that must agree — `instrument.ts` (the
 * resource `service.name` on every exported span, metric and log record),
 * `telemetry.ts` (the tracer's instrumentation scope) and `otel-logger.ts`
 * (the logger's scope). ADR-28 exists because three copies of this kind of
 * setup drifted; a literal repeated three times inside one app is the same
 * mistake at a smaller scale.
 *
 * Its own module rather than a constant exported from `instrument.ts`, so
 * that importing the tracer or the logger does not drag in — and execute —
 * the whole SDK bootstrap.
 */
export const DEFAULT_SERVICE_NAME = 'ragen-mcp';

/** `OTEL_SERVICE_NAME` wins when set, as it does in apps/api and apps/worker. */
export function resolveServiceName(): string {
  return (process.env.OTEL_SERVICE_NAME ?? '').trim() || DEFAULT_SERVICE_NAME;
}

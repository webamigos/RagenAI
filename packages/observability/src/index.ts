export {
  createOtelLogger,
  normalizeAttributes,
  type OtelLogger,
  type LogAttributes,
} from './otel-logger';

export {
  mapPinoLogToOtel,
  PINO_LEVEL_TO_OTEL,
  type PinoOtelRecord,
  type PinoOtelSeverity,
} from './pino-otel-bridge';

export {
  createTelemetry,
  trace,
  metrics,
  SpanStatusCode,
  type Telemetry,
  type Attributes,
  type Span,
  type Tracer,
  type Meter,
} from './telemetry';

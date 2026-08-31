import { logs, SeverityNumber } from '@opentelemetry/api-logs';

export type LogAttributes = Record<string, unknown>;

export interface OtelLogger {
  debug(message: string, attrs?: LogAttributes): void;
  info(message: string, attrs?: LogAttributes): void;
  warn(message: string, attrs?: LogAttributes): void;
  error(message: string, attrs?: LogAttributes): void;
}

/**
 * Flatten arbitrary attributes into the scalar shape the OTel logs API accepts.
 *
 * Errors are expanded into `.type` / `.message` / `.stacktrace` rather than
 * being stringified to "[object Object]", which is the whole reason this is not
 * a one-line JSON.stringify.
 */
export function normalizeAttributes(
  attrs?: LogAttributes,
): Record<string, string | number | boolean> {
  if (!attrs) {
    return {};
  }

  const result: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(attrs)) {
    if (value instanceof Error) {
      result[`${key}.type`] = value.constructor.name || 'Error';
      result[`${key}.message`] = value.message;
      if (value.stack) {
        result[`${key}.stacktrace`] = value.stack;
      }
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      result[key] = value;
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else {
      try {
        result[key] = JSON.stringify(value);
      } catch {
        // Circular structures and BigInt both throw here.
        result[key] = String(value);
      }
    }
  }

  return result;
}

/**
 * Build an OTel logs bridge for one instrumentation scope.
 *
 * The three apps used to carry byte-identical copies of this that differed only
 * in the scope name, so the name is the parameter and everything else is shared
 * (ADR-28). `OTEL_SERVICE_NAME` still wins when set, matching what ragen-app
 * did and what each app's SDK setup already does for the resource-level service
 * name.
 *
 * When no OTLP endpoint is configured the global logger provider is a no-op, so
 * this costs effectively nothing.
 */
export function createOtelLogger(defaultScopeName: string): OtelLogger {
  const scopeName =
    (process.env.OTEL_SERVICE_NAME ?? '').trim() || defaultScopeName;
  const logger = logs.getLogger(scopeName);

  const emit = (
    severityNumber: SeverityNumber,
    severityText: string,
    message: string,
    attrs?: LogAttributes,
  ): void => {
    logger.emit({
      severityNumber,
      severityText,
      body: message,
      attributes: normalizeAttributes(attrs),
    });
  };

  return {
    debug: (message, attrs) =>
      emit(SeverityNumber.DEBUG, 'DEBUG', message, attrs),
    info: (message, attrs) => emit(SeverityNumber.INFO, 'INFO', message, attrs),
    warn: (message, attrs) => emit(SeverityNumber.WARN, 'WARN', message, attrs),
    error: (message, attrs) =>
      emit(SeverityNumber.ERROR, 'ERROR', message, attrs),
  };
}

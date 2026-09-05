import { type LogAttributes } from './otel-logger';

/**
 * The OTel severities a pino record can map onto.
 *
 * Narrower than `keyof OtelLogger` on purpose: `debug` is deliberately
 * unreachable (see `PINO_LEVEL_TO_OTEL`), and typing it out of the result
 * makes that a fact the compiler knows rather than a comment.
 */
export type PinoOtelSeverity = 'info' | 'warn' | 'error';

/**
 * pino's numeric levels → OTel severities.
 *
 * `trace` (10) and `debug` (20) are absent, and that is the behaviour, not an
 * omission: debug lines are a local-development aid, and shipping them to the
 * collector is volume nobody reads. They still reach stdout — this map only
 * governs the OTel copy.
 *
 * `fatal` (60) folds into `error` because the OTel logs API has no severity
 * above error that pino's fatal corresponds to.
 */
export const PINO_LEVEL_TO_OTEL: Readonly<Record<number, PinoOtelSeverity>> = {
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'error',
};

export interface PinoOtelRecord {
  severity: PinoOtelSeverity;
  message: string;
  attributes?: LogAttributes;
}

/**
 * Decide what — if anything — one pino call should emit to the OTel logs API.
 *
 * This is the whole of what apps/web, apps/worker and apps/mcp had copied
 * between them: three byte-identical `hooks.logMethod` bodies whose only
 * difference was the import path for `otelLogger`. ADR-28 left "the main
 * logger" out of scope because apps/web's is a webpack-swapped client/server
 * pair — true of the surrounding pino setup, but not of this decision table,
 * which is pure and identical everywhere.
 *
 * Returns the record to emit, or `undefined` when there is nothing to emit —
 * either the level is not mirrored, or the call carried no message.
 *
 * Deliberately a pure function over `(level, inputArgs)` rather than a
 * ready-made pino hook: a hook would have to name pino's `LogFn` and
 * `logMethod` types, which would either drag pino into this package's
 * dependencies or force a cast at every call site. Each app keeps five lines
 * of glue instead, and the part that can actually drift lives here.
 *
 * @param level pino's numeric level for the call
 * @param inputArgs the arguments the caller passed to `logger.info(...)` etc.
 */
export function mapPinoLogToOtel(
  level: number,
  inputArgs: readonly unknown[],
): PinoOtelRecord | undefined {
  const severity = PINO_LEVEL_TO_OTEL[level];
  if (!severity) {
    return undefined;
  }

  let message: string | undefined;
  let attributes: LogAttributes | undefined;

  // pino accepts either `(message)` or `(attributes, message)`. Anything
  // else — an attributes object with no message, a non-string first
  // argument — leaves `message` unset, and an OTel log record with no body
  // is worse than none, so those emit nothing.
  const [first, second] = inputArgs;
  if (typeof first === 'string') {
    message = first;
  } else if (typeof first === 'object' && first !== null) {
    attributes = first as LogAttributes;
    if (typeof second === 'string') {
      message = second;
    }
  }

  if (!message) {
    return undefined;
  }

  return { severity, message, attributes };
}

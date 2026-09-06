import pino from 'pino';
import pretty from 'pino-pretty';

import { otelLogger } from './telemetry/otel-logger.js';

const isProductionTargetEnv = process.env.TARGET_ENV === 'production';

/**
 * pino's numeric levels → the OTel logs bridge. debug (20) is deliberately
 * absent: debug lines are a local-development aid and shipping them to the
 * collector is noise nobody reads. Same table as apps/web's and
 * apps/worker's loggers.
 */
const pinoLevelToOtel: Record<number, keyof typeof otelLogger> = {
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'error',
};

/**
 * One logger, two sinks: pino writes human-readable lines to stdout (which
 * is what Railway's log view shows), and the `logMethod` hook mirrors the
 * same record into the OTel logs API, where it becomes a log record
 * correlated with whatever span is active.
 *
 * The mirroring is a no-op until `OTEL_EXPORTER_OTLP_ENDPOINT` is set — the
 * global logger provider is the API's built-in no-op until instrument.ts
 * replaces it.
 */
const logger = pino(
  {
    level: isProductionTargetEnv ? 'info' : 'debug',
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME,
    },
    serializers: { err: pino.stdSerializers.err },
    hooks: {
      logMethod(inputArgs, method, level) {
        const otelMethod = pinoLevelToOtel[level];
        if (otelMethod) {
          let message: string | undefined;
          let attrs: Record<string, unknown> | undefined;

          if (typeof inputArgs[0] === 'string') {
            message = inputArgs[0];
          } else if (
            typeof inputArgs[0] === 'object' &&
            inputArgs[0] !== null
          ) {
            attrs = inputArgs[0] as Record<string, unknown>;
            if (typeof inputArgs[1] === 'string') {
              message = inputArgs[1];
            }
          }

          if (message) {
            otelLogger[otelMethod](message, attrs);
          }
        }

        method.apply(this, inputArgs as Parameters<typeof method>);
      },
    },
  },
  pretty({ colorize: true }),
);

export { logger };

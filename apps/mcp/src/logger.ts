import { mapPinoLogToOtel } from '@ragenai/observability';
import pino from 'pino';
import pretty from 'pino-pretty';

import { otelLogger } from './telemetry/otel-logger.js';

const isProductionTargetEnv = process.env.TARGET_ENV === 'production';

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
        const record = mapPinoLogToOtel(level, inputArgs);
        if (record) {
          otelLogger[record.severity](record.message, record.attributes);
        }

        method.apply(this, inputArgs as Parameters<typeof method>);
      },
    },
  },
  pretty({ colorize: true }),
);

export { logger };

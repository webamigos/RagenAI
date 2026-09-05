import { mapPinoLogToOtel } from '@ragenai/observability';
import pino from 'pino';
import pretty from 'pino-pretty';

import { isProductionTargetEnv } from '../utils/env';
import { otelLogger } from './otel-logger';

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

logger.info('Server logger initialized');

export { logger };

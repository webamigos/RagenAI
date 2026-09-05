import { mapPinoLogToOtel } from '@ragenai/observability';
import pino from 'pino';
import { otelLogger } from '@/libs/monitoring/otel-logger';

import { isProductionTargetEnv } from '@/libs/utils/env';

// Ensure this file only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('This module should only be used on the server side');
}

const pretty = require('pino-pretty');

const logger = pino(
  {
    level: isProductionTargetEnv ? 'info' : 'debug',
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME,
    },
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

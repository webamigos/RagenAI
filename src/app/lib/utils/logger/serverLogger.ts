import pino from 'pino';
import { otelLogger } from '@/libs/monitoring/otel-logger';

import { isProductionTargetEnv } from '@/libs/utils/env';

// Ensure this file only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('This module should only be used on the server side');
}

const pretty = require('pino-pretty');

const pinoLevelToOtel: Record<number, keyof typeof otelLogger> = {
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'error',
};

const logger = pino(
  {
    level: isProductionTargetEnv ? 'info' : 'debug',
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME,
    },
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
  pretty({ colorize: true })
);

export { logger };

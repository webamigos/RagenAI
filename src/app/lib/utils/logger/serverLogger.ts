import pino from 'pino';
import { createWriteStream } from 'pino-sentry';
import { otelLogger } from '@/libs/monitoring/otel-logger';

import { isProductionTargetEnv, isStagingTargetEnv } from '@/libs/utils/env';

const streams = [];

// Ensure this file only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('This module should only be used on the server side');
}

if ((isProductionTargetEnv || isStagingTargetEnv) && process.env.SENTRY_DSN) {
  const sentryStream = createWriteStream({
    dsn: process.env.SENTRY_DSN,
    level: isProductionTargetEnv || isStagingTargetEnv ? 'warning' : 'info',
    stackAttributeKey: 'err.stack',
    environment: process.env.TARGET_ENV
      ? process.env.TARGET_ENV
      : process.env.NODE_ENV,
  });

  streams.push({
    stream: sentryStream,
  });
}

const pretty = require('pino-pretty');
streams.push({
  stream: pretty({
    colorize: true,
  }),
});

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
  streams.length ? pino.multistream(streams) : pino.destination()
);

logger.info('Server logger initialized');

export { logger };

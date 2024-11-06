import pino from 'pino';
import { createWriteStream } from 'pino-sentry';

import { isProduction } from '@/libs/utils/env';

const streams = [];

// Ensure this file only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('This module should only be used on the server side');
}

if (isProduction && process.env.SENTRY_DSN) {
  const sentryStream = createWriteStream({
    dsn: process.env.SENTRY_DSN,
    level: 'info',
    environment: process.env.NODE_ENV,
  });

  streams.push({
    stream: sentryStream,
  });
}

if (!isProduction) {
  // Dynamically import pino-pretty only on the server
  const pretty = require('pino-pretty');
  streams.push({
    stream: pretty({
      colorize: true,
    }),
  });
}

const logger = pino(
  {
    level: isProduction ? 'info' : 'debug',
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME,
    },
  },
  streams.length ? pino.multistream(streams) : pino.destination()
);

logger.info('Server logger initialized');

export { logger };

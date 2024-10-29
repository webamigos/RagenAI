import pino from 'pino';
import { createWriteStream } from 'pino-sentry';

import { isProduction, isTest } from '@/libs/utils/env';

const streams = [];

// Ensure this file only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('This module should only be used on the server side');
}

if (isTest) {
  // Add silent logger to streams for test environment
  streams.push({
    level: 'silent',
    stream: {
      write: () => {}, // no-op write function
    },
  });
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

export const logger = pino(
  {
    level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
  },
  streams.length ? pino.multistream(streams) : undefined
);

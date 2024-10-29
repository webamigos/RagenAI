import pino from 'pino';
import { SentryContext, SentryTag } from '../services/sentry';
import { createWriteStream } from 'pino-sentry';

const isProduction = process.env.NODE_ENV === 'production';

const streams = [];

// Ensure this file only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('This module should only be used on the server side');
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

export const logger = pino(
  {
    level: isProduction ? 'info' : 'debug',
  },
  pino.multistream(streams)
);

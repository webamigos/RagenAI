import pino from 'pino';
import { SentryContext, SentryTag } from '../services/sentry';
import { createWriteStream } from 'pino-sentry';

// Create Sentry stream
const sentryStream = createWriteStream({
  dsn: process.env.SENTRY_DSN,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  // Optional: configure environment
  environment: process.env.NODE_ENV,
});

export const logger = pino(
  {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
  pino.multistream([
    {
      stream: require('pino-pretty')({
        colorize: true,
      }),
    },
    {
      stream: sentryStream,
    },
  ])
);

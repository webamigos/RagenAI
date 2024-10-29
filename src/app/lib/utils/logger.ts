import pino from 'pino';
import { SentryContext, SentryTag } from '../services/sentry';
import { createWriteStream } from 'pino-sentry';

const isProduction = process.env.NODE_ENV === 'production';

const streams = [
  {
    stream: require('pino-pretty')({
      colorize: true,
    }),
  },
];

if (isProduction) {
  // TODO: use staging env in the future?
  const sentryStream = createWriteStream({
    dsn: process.env.SENTRY_DSN,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    // Optional: configure environment
    environment: process.env.NODE_ENV,
  });

  streams.push({
    stream: sentryStream,
  });
}

export const logger = pino(
  {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
  pino.multistream(streams)
);

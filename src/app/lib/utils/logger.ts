import pino from 'pino';

// TODO: decide which logs show on production
// const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      },
      // Pros: Below configuration automatically creates Sentry context using logger.error
      // Cons: It ignores Sentry.setTag
      // {
      //   target: 'pino-sentry-transport',
      //   options: {
      //     sentry: {
      //       dsn: process.env.SENTRY_DSN,
      //     },
      //     withLogRecord: true,
      //     tags: ['level'],
      //     context: ['hostname'],
      //     minLevel: 40, // Captures warnings (40) and errors (50)
      //   },
      //   level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      // },
    ],
  },
});

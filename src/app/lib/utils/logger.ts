import pino from 'pino';

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
      // Pros: Below configuration automatically creates Pinot context in Sentry using logger.error
      {
        target: 'pino-sentry-transport',
        options: {
          sentry: {
            dsn: process.env.SENTRY_DSN,
          },
          withLogRecord: true,
          tags: [
            'level',
            // IMPORTANT: do not import consts from sentry.ts
            'clerk_session_id',
            'clerk_organization_id',
            'clerk_user_id',
            'app_service',
          ],
          context: ['hostname', 'clerk'],
          minLevel: 40, // Captures warnings (40) and errors (50)
        },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      },
    ],
  },
});

import pino from 'pino';

// TODO: decide which logs show on production
// const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

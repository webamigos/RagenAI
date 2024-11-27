import {
  isProductionTargetEnv,
  isStagingTargetEnv,
  isLocalTargetEnv,
} from '@/libs/utils/env';
import * as Sentry from '@sentry/browser';
import { AppLogger } from './interface';

// Initialize Sentry for browser
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
});

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

class ClientLogger implements AppLogger {
  private log(level: LogLevel, message: string | object, ...args: any[]) {
    // Development logging to console
    if (isLocalTargetEnv) {
      // eslint-disable-next-line no-console
      console[level](message, ...args);
    }

    // Production or staging logging to Sentry
    if (isProductionTargetEnv || isStagingTargetEnv) {
      if (level === 'error') {
        Sentry.captureException(args[0] || message);
      } else {
        let logMessage =
          typeof message === 'string'
            ? message
            : `Object: ${JSON.stringify(message, null, 2)}`;

        Sentry.captureMessage(logMessage, {
          level: level === 'warn' ? 'warning' : level,
          extra: args.length ? { extra: args } : undefined,
        });
      }
    }
  }

  info(message: string | object, ...args: any[]) {
    this.log('info', message as string, ...args);
  }

  error(message: string | object, ...args: any[]) {
    this.log('error', message as string, ...args);
  }

  warn(message: string | object, ...args: any[]) {
    this.log('warn', message as string, ...args);
  }

  debug(message: string | object, ...args: any[]) {
    this.log('debug', message as string, ...args);
  }
}

const logger = new ClientLogger();

logger.info('Client logger initialized');

export { logger };

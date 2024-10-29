import { isDevelopment, isProduction } from '@/libs/utils/env';
import * as Sentry from '@sentry/browser';

// Initialize Sentry for browser
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
});

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

class ClientLogger {
  private log(level: LogLevel, message: string, ...args: any[]) {
    // Development logging to console
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console[level](message, ...args);
    }

    // Production logging to Sentry
    if (isProduction) {
      if (level === 'error') {
        Sentry.captureException(args[0] || message);
      } else {
        Sentry.captureMessage(message, {
          level: level === 'warn' ? 'warning' : level,
          extra: args.length ? { extra: args } : undefined,
        });
      }
    }
  }

  info(message: string, ...args: any[]) {
    this.log('info', message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.log('error', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args);
  }
}

export const clientLogger = new ClientLogger();

import pino, { type Logger } from 'pino';
import { otelLogger } from '@/libs/monitoring/otel-logger';

const isProductionTargetEnv =
  process.env.NEXT_PUBLIC_TARGET_ENV === 'production';

const COLOR = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
  DIM: '\x1b[2m',
} as const;

const getLevelColor = (level: string): string => {
  switch (level) {
    case 'ERROR':
      return COLOR.RED;
    case 'WARN':
      return COLOR.YELLOW;
    case 'INFO':
      return COLOR.BLUE;
    case 'DEBUG':
      return COLOR.GRAY;
    default:
      return COLOR.WHITE;
  }
};

const pinoLevelToOtel: Record<number, keyof typeof otelLogger> = {
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'error',
};

const logger: Logger = pino({
  level: isProductionTargetEnv ? 'info' : 'debug',
  browser: {
    write: (logObj: unknown) => {
      if (isProductionTargetEnv) {
        return;
      }

      const { level, msg, time, ...extra } = logObj as Record<string, unknown>;
      const levelUpperCased = (level as string).toUpperCase();
      const timeFormatted = new Date(time as string).toLocaleTimeString(
        'en-GB',
        {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3,
        },
      );
      const levelColor = getLevelColor(levelUpperCased);

      const formatted = `[${timeFormatted}] ${levelColor}${levelUpperCased}${COLOR.RESET} ${msg}`;

      if (Object.keys(extra).length > 0) {
        // eslint-disable-next-line no-console
        console.log(formatted, extra);
      } else {
        // eslint-disable-next-line no-console
        console.log(formatted);
      }
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  },
  hooks: {
    logMethod(inputArgs, method, level) {
      const otelMethod = pinoLevelToOtel[level];
      if (otelMethod) {
        let message: string | undefined;
        let attrs: Record<string, unknown> | undefined;

        if (typeof inputArgs[0] === 'string') {
          message = inputArgs[0];
        } else if (typeof inputArgs[0] === 'object' && inputArgs[0] !== null) {
          attrs = inputArgs[0] as Record<string, unknown>;
          if (typeof inputArgs[1] === 'string') {
            message = inputArgs[1];
          }
        }

        if (message) {
          otelLogger[otelMethod](message, attrs);
        }
      }

      method.apply(this, inputArgs as Parameters<typeof method>);
    },
  },
});

logger.info('Client logger initialized');

export { logger };

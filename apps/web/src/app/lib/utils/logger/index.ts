import { type AppLogger } from './interface';

// for better DX - developer doesn't
// need to think which logger choose on server or client side
let logger: AppLogger;

if (typeof window !== 'undefined') {
  // Client-side - use clientLogger
  const clientLoggerModule = require('./clientLogger');
  logger = clientLoggerModule.logger;
} else {
  // Server-side - only import serverLogger on server
  try {
    const serverLoggerModule = require('./serverLogger');
    logger = serverLoggerModule.logger;
  } catch (e) {
    // Fallback to clientLogger if serverLogger fails (shouldn't happen in production)
    const clientLoggerModule = require('./clientLogger');
    logger = clientLoggerModule.logger;
  }
}

export { logger };

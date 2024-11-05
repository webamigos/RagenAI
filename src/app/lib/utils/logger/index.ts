import { AppLogger } from './interface';

// for better DX - developer doesn't
// need to think which logger choose on server or client side
export const logger: AppLogger =
  typeof window !== 'undefined'
    ? require('./clientLogger').logger
    : require('./serverLogger').logger;

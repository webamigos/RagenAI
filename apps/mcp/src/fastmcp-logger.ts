import { inspect } from 'node:util';

import type { Logger as FastMcpLogger } from 'fastmcp';

import { logger } from './logger.js';

/**
 * FastMCP logs to `console` unless it is handed a logger. That is how
 * "[FastMCP info] server is running…" and, more importantly, every internal
 * error it reports used to leave this process: as bare stdout lines that no
 * OTel log record was ever made from, sitting next to pino's structured ones
 * in an inconsistent format.
 *
 * Its `Logger` interface is console-shaped — variadic `unknown[]`, no
 * message/attributes split — so this adapter renders the arguments the way
 * console would (strings as-is, everything else through `util.inspect`, which
 * keeps an Error's stack readable) and hands the result to pino as a message.
 */
function toMessage(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 3 })))
    .join(' ');
}

export const fastmcpLogger: FastMcpLogger = {
  debug: (...args) => logger.debug(toMessage(args)),
  error: (...args) => logger.error(toMessage(args)),
  info: (...args) => logger.info(toMessage(args)),
  // FastMCP's `log` is its console.log equivalent — there is no OTel severity
  // between debug and info for it to map to.
  log: (...args) => logger.info(toMessage(args)),
  warn: (...args) => logger.warn(toMessage(args)),
};

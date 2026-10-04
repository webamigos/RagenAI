import { logger } from '../logger.js';

/**
 * What a tool answers when it runs with no session — a real path since the
 * stdio transport: over HTTP `authenticate` rejects a keyless connection
 * before any tool runs, but over stdio the session starts without one when
 * `RAGEN_API_KEY` is unset, so that the tools can still be listed.
 *
 * A result rather than a throw, so the client shows the fix instead of a
 * protocol error.
 */
export const NO_SESSION_ERROR =
  'No Ragen API key: over HTTP send "Authorization: Bearer sk-<keyId>.<secret>"; over stdio set RAGEN_API_KEY.';

export function noSessionResult(tool: string): string {
  logger.warn({ tool }, 'Tool call refused: no Ragen API key in the session');
  return JSON.stringify({ success: false, error: NO_SESSION_ERROR });
}

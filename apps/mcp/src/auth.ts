import type { IncomingMessage } from 'node:http';

import { logger } from './logger.js';

/**
 * Session data threaded through to every tool's `execute` — just the raw
 * Authorization header, forwarded as-is to apps/api. Validity (is this a
 * real, active Ragen API key?) is apps/api's ApiKeyGuard's job; this server
 * only checks that *something Bearer-shaped* was supplied, so a request
 * with no key at all fails fast instead of reaching apps/api just to bounce.
 */
export interface RagenSession {
  apiKey: string;
  [key: string]: unknown; // satisfies FastMCP's Record<string, unknown> bound
}

export async function authenticate(
  request: IncomingMessage,
): Promise<RagenSession> {
  const header = request.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value?.startsWith('Bearer ')) {
    // Logged, never the header itself: a malformed value is still a
    // credential someone typed, and this is the one place a client that
    // cannot connect at all leaves a trace. `hasHeader` distinguishes the
    // two real causes — a client that sends nothing (a misconfigured MCP
    // entry) from one that sends the wrong scheme — and the user agent says
    // which client it was, which is what makes the line actionable.
    //
    // Deliberately not the peer address: behind Railway's edge proxy
    // `socket.remoteAddress` is the proxy, never the caller, so it would be
    // a personal-data question asked in exchange for no information. No app
    // in this repo logs a client IP.
    logger.warn(
      {
        hasHeader: value !== undefined,
        userAgent: request.headers['user-agent'],
      },
      'Rejected MCP connection: missing or malformed Authorization header',
    );

    // statusText must be a valid HTTP ByteString (ASCII/Latin-1 only) or the
    // Response constructor itself throws a plain TypeError before this ever
    // becomes the 401 it's meant to be — no em dashes or other non-Latin-1
    // characters here.
    throw new Response(null, {
      status: 401,
      statusText:
        'Missing or malformed Authorization header: expected "Bearer sk-<keyId>.<secret>" (a Ragen API key)',
    });
  }

  return { apiKey: value };
}

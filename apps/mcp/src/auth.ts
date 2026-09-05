import type { IncomingMessage } from 'node:http';

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

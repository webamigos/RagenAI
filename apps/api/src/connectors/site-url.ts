import { isPrivateOrLoopbackHost } from './private-address.js';

/**
 * Ported from apps/web's src/features/connectors/utils/site-url.ts, which was
 * deleted once connector registration cut over to this endpoint — see
 * docs/adrs/21-monorepo-and-api-decoupling.md. This is the only copy now, so
 * a hardening added here does not need mirroring.
 *
 * Normalize a user-supplied shop URL for custom-header MCP connectors.
 * Enforces HTTPS, strips trailing slashes, rejects anything that isn't a
 * parseable URL, and rejects hosts that point into the local network.
 * Returns the normalized origin + path (no query/hash) so the downstream
 * `${siteUrl}${mcpServerUrlPath}` join is predictable.
 *
 * This is only the parse-time half of the SSRF guard, and it is the weaker
 * half: it can only judge what is written in the URL. A public hostname that
 * *resolves* to a private address (DNS rebinding) is invisible here, and is
 * caught at the outbound-request boundary instead — see `guarded-fetch.ts`.
 */
export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Site URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Site URL must be a valid URL (including https://)');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Site URL must use https://');
  }

  // Reject embedded credentials (`https://user:pass@host`). URL.origin
  // silently drops them, which would otherwise hide a likely paste
  // mistake. The consumer key/secret go in dedicated fields, not the URL.
  if (parsed.username || parsed.password) {
    throw new Error('Site URL must not contain embedded credentials');
  }

  // SSRF guard: this URL is later handed to `createMCPClient`, which fetches
  // it from apps/api's own network position. An org member could otherwise
  // point a connector at a loopback/private/link-local address to reach an
  // internal service. Classification lives in `private-address.ts` because
  // the connect-time guard has to apply the identical policy to the
  // addresses the resolver actually returns.
  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error('Site URL must not point to a local or private address');
  }

  // Strip trailing slash from pathname; normalize the full URL to origin + path.
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

/**
 * Ported verbatim from apps/web's
 * src/features/connectors/utils/site-url.ts (`normalizeSiteUrl` only —
 * the rest of that file's exports are UI-only). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Normalize a user-supplied shop URL for custom-header MCP connectors.
 * Enforces HTTPS, strips trailing slashes, and rejects anything that
 * isn't a parseable URL. Returns the normalized origin + path (no
 * query/hash) so the downstream `${siteUrl}${mcpServerUrlPath}` join
 * is predictable.
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

  // Strip trailing slash from pathname; normalize the full URL to origin + path.
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

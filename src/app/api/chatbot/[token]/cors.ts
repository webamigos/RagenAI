const normalizeAllowedEntry = (entry: string): string => {
  // Accept bare hostnames like "example.com" alongside full origins like
  // "https://example.com" — the settings UI stores the origin form, but
  // legacy data and wildcards pass through untouched.
  if (entry.startsWith('*.')) {
    return entry;
  }
  try {
    return new URL(entry).origin;
  } catch {
    try {
      return new URL(`https://${entry}`).origin;
    } catch {
      return entry;
    }
  }
};

export function validateOrigin(
  origin: string | null,
  allowedOrigins: string[],
): boolean {
  if (allowedOrigins.length === 0) {
    return true;
  }
  if (!origin) {
    return false;
  }
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  return allowedOrigins.some((allowed) => {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(2);
      return (
        hostname.endsWith(suffix) &&
        hostname.length > suffix.length &&
        hostname[hostname.length - suffix.length - 1] === '.'
      );
    }
    return normalizeAllowedEntry(allowed) === origin;
  });
}

/**
 * Build CORS response headers for the public chatbot endpoints.
 *
 * - When the caller allows all origins (empty whitelist), we echo `*`.
 * - When a whitelist is configured AND the request origin validates,
 *   we echo that specific origin.
 * - When a whitelist is configured AND the origin is invalid/absent,
 *   we omit `Access-Control-Allow-Origin` entirely — the browser will
 *   block the response, which is the correct CORS behaviour.
 *
 * Intentionally does NOT set `Access-Control-Allow-Credentials`. The
 * widget is a public token-based API and does not rely on cookies, so
 * credentials must be off. Setting it to `true` alongside a `*` origin
 * would also be an invalid combination rejected by all browsers.
 */
export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };

  if (allowedOrigins.length === 0) {
    return { ...baseHeaders, 'Access-Control-Allow-Origin': '*' };
  }

  if (origin && validateOrigin(origin, allowedOrigins)) {
    return { ...baseHeaders, 'Access-Control-Allow-Origin': origin };
  }

  return baseHeaders;
}

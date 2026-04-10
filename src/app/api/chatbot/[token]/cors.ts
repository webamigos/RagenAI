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
      const suffix = allowed.slice(2); // e.g. "example.com"
      return (
        hostname.endsWith(suffix) &&
        hostname.length > suffix.length &&
        hostname[hostname.length - suffix.length - 1] === '.'
      );
    }
    return allowed === origin;
  });
}

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
) {
  const allowOrigin = allowedOrigins.length === 0 ? '*' : (origin ?? '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials':
      allowedOrigins.length > 0 ? 'true' : 'false',
  };
}

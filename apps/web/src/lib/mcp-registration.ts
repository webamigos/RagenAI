import { APIError } from 'better-auth/api';

export const MCP_REGISTRATION_RATE_LIMIT = { window: 60, max: 10 } as const;

/** Additional policy ahead of the provider's RFC 7591 schema validation. */
export function assertMcpRegistrationRedirects(body: unknown): void {
  if (!body || typeof body !== 'object') {
    throw new APIError('BAD_REQUEST', {
      message: 'Client metadata is required',
    });
  }
  const metadata = body as Record<string, unknown>;
  if ('skip_consent' in metadata || 'skipConsent' in metadata) {
    throw new APIError('BAD_REQUEST', {
      message: 'Consent cannot be disabled by a registered client',
    });
  }
  for (const field of ['redirect_uris', 'post_logout_redirect_uris']) {
    const values = metadata[field];
    if (values === undefined && field === 'post_logout_redirect_uris') {
      continue;
    }
    if (!Array.isArray(values) || values.length === 0) {
      throw new APIError('BAD_REQUEST', {
        message: 'Redirect URIs are required',
      });
    }
    for (const value of values) {
      let uri: URL;
      try {
        if (typeof value !== 'string') {
          throw new Error('Invalid URI');
        }
        uri = new URL(value);
      } catch {
        throw new APIError('BAD_REQUEST', { message: 'Invalid redirect URI' });
      }
      const loopback =
        uri.hostname === 'localhost' || uri.hostname === '127.0.0.1';
      if (
        uri.username ||
        uri.password ||
        uri.hash ||
        uri.hostname.includes('*') ||
        (uri.protocol !== 'https:' &&
          !(uri.protocol === 'http:' && loopback)) ||
        (loopback && metadata.application_type !== 'native')
      ) {
        throw new APIError('BAD_REQUEST', {
          message:
            'Redirects require HTTPS; loopback redirects require a native client',
        });
      }
    }
  }
}

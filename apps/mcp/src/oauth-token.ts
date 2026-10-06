import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';

export interface OAuthIdentity {
  userId: string;
  orgId: string;
  projectId?: string;
  clientId: string;
  jti: string;
  expiresAt: number;
}

export class OAuthTokenError extends Error {
  constructor(public readonly status: 401 | 403 | 503) {
    super(
      {
        401: 'Invalid access token',
        403: 'Insufficient scope',
        503: 'Authorization keys unavailable',
      }[status],
    );
  }
}

const algorithms = ['EdDSA', 'ES256', 'ES512', 'PS256', 'RS256'];

/** One verifier per resource server; the remote key resolver caches JWKS. */
export function createOAuthTokenVerifier(
  issuer: string,
  resource: string,
  getKey?: JWTVerifyGetKey,
): (token: string) => Promise<OAuthIdentity> {
  const resolveKey =
    getKey ??
    createRemoteJWKSet(new URL(`${issuer}/jwks`), {
      [customFetch]: async (...args) => {
        try {
          const response = await fetch(...args);
          if (!response.ok) throw new OAuthTokenError(503);
          return response;
        } catch {
          throw new OAuthTokenError(503);
        }
      },
    });
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, resolveKey, {
        issuer,
        audience: resource,
        algorithms,
        requiredClaims: ['exp', 'sub', 'jti'],
      });
      const stringClaim = (value: unknown): value is string =>
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 2048;
      if (
        !stringClaim(payload.sub) ||
        !stringClaim(payload.org) ||
        !stringClaim(payload.client_id) ||
        !stringClaim(payload.jti) ||
        (payload.project !== undefined && !stringClaim(payload.project)) ||
        payload.cnf !== undefined ||
        typeof payload.exp !== 'number'
      ) {
        throw new OAuthTokenError(401);
      }
      if (
        typeof payload.scope !== 'string' ||
        !payload.scope.split(/\s+/).includes('mcp:read')
      ) {
        throw new OAuthTokenError(403);
      }
      return {
        userId: payload.sub,
        orgId: payload.org,
        ...(payload.project === undefined
          ? {}
          : { projectId: payload.project }),
        clientId: payload.client_id,
        jti: payload.jti,
        expiresAt: payload.exp,
      };
    } catch (error) {
      if (error instanceof OAuthTokenError) throw error;
      // Never expose JOSE errors, token contents, or key material to clients.
      throw new OAuthTokenError(401);
    }
  };
}

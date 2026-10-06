import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface OAuthIdentity {
  userId: string;
  orgId: string;
  projectId?: string;
  clientId: string;
  jti: string;
  expiresAt: number;
}

export class OAuthTokenError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 403 ? 'Insufficient scope' : 'Invalid access token');
  }
}

const algorithms = ['EdDSA', 'ES256', 'ES512', 'PS256', 'RS256'];

/** One verifier per resource server; the remote key resolver caches JWKS. */
export function createOAuthTokenVerifier(
  issuer: string,
  resource: string,
  getKey: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${issuer}/jwks`)),
): (token: string) => Promise<OAuthIdentity> {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, getKey, {
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
        !stringClaim(payload.orgId) ||
        !stringClaim(payload.client_id) ||
        !stringClaim(payload.jti) ||
        (payload.projectId !== undefined && !stringClaim(payload.projectId)) ||
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
        orgId: payload.orgId,
        ...(payload.projectId === undefined
          ? {}
          : { projectId: payload.projectId }),
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

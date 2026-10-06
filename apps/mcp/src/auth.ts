import type { IncomingMessage } from 'node:http';
import { issueMcpServiceAssertion } from '@ragenai/crypto/mcp-service';

import { logger } from './logger.js';
import { getEnv } from './config/env.js';
import {
  createOAuthTokenVerifier,
  OAuthTokenError,
  type OAuthIdentity,
} from './oauth-token.js';

export type RagenSession = (
  | { kind: 'api_key'; apiKey: string }
  | ({ kind: 'oauth'; accessToken: string } & OAuthIdentity)
) &
  Record<string, unknown>;

let verifier: ReturnType<typeof createOAuthTokenVerifier> | undefined;
let verifierConfig: string | undefined;

export function oauthIssuer(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/auth`;
}

export function oauthChallenge(status: 401 | 403, error?: string): Response {
  const env = getEnv();
  const metadata = new URL(
    '/.well-known/oauth-protected-resource',
    env.RAGEN_MCP_PUBLIC_URL,
  ).href;
  return new Response(null, {
    status,
    headers: {
      'WWW-Authenticate': `Bearer resource_metadata="${metadata}", scope="mcp:read"${error ? `, error="${error}"` : ''}`,
    },
  });
}

export async function authenticate(
  request: IncomingMessage | undefined,
): Promise<RagenSession> {
  const env = getEnv();
  if (!request) {
    if (!env.RAGEN_API_KEY)
      throw new Error(
        'RAGEN_API_KEY is not set: tools are listed, but every tool call will be refused until it is',
      );
    return { kind: 'api_key', apiKey: `Bearer ${env.RAGEN_API_KEY}` };
  }
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ') || value.length === 7) {
    logger.warn(
      {
        hasHeader: value !== undefined,
        userAgent: request.headers['user-agent'],
      },
      'Rejected MCP connection: missing or malformed Authorization header',
    );
    throw env.MCP_OAUTH_ENABLED === 'true'
      ? oauthChallenge(401)
      : new Response(null, { status: 401 });
  }
  if (value.startsWith('Bearer sk-')) return { kind: 'api_key', apiKey: value };
  if (env.MCP_OAUTH_ENABLED !== 'true')
    throw new Response(null, { status: 401 });
  const issuer = oauthIssuer(env.BETTER_AUTH_URL!);
  const config = `${issuer}|${env.RAGEN_MCP_PUBLIC_URL}`;
  if (!verifier || verifierConfig !== config) {
    verifier = createOAuthTokenVerifier(issuer, env.RAGEN_MCP_PUBLIC_URL!);
    verifierConfig = config;
  }
  try {
    const identity = await verifier(value.slice(7));
    return { kind: 'oauth', accessToken: value.slice(7), ...identity };
  } catch (error) {
    const status = error instanceof OAuthTokenError ? error.status : 401;
    throw oauthChallenge(
      status,
      status === 403 ? 'insufficient_scope' : 'invalid_token',
    );
  }
}

/** Fresh, short-lived API credential on every call; the user token stays here. */
export function apiAuthorization(session: RagenSession): string {
  if (session.kind === 'api_key') return session.apiKey;
  if (session.expiresAt <= Date.now() / 1000)
    throw oauthChallenge(401, 'invalid_token');
  const secret = getEnv().MCP_SERVICE_SECRET;
  if (!secret) throw new Error('MCP service secret is missing');
  const { userId, orgId, projectId, clientId, jti } = session;
  return `Bearer ${issueMcpServiceAssertion({ userId, orgId, projectId, clientId, jti }, secret)}`;
}

import { auth } from './auth';
import { APIError } from 'better-auth/api';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';

export async function verifiedMcpQuery(query: string) {
  const context = await auth.$context;
  if (!(await verifyOAuthQueryParams(query, context.secret))) {
    throw new APIError('FORBIDDEN', {
      message: 'Connection request expired or is invalid',
    });
  }
  const params = new URLSearchParams(query);
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  if (!clientId || !redirectUri) {
    throw new APIError('BAD_REQUEST', {
      message: 'Incomplete connection request',
    });
  }
  return { params, clientId, redirectHost: new URL(redirectUri).host };
}

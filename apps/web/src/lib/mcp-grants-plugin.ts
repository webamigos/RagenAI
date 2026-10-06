import type { DBAdapter } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api';
import { z } from 'zod';

/** All storage mutations remain inside a Better Auth plugin API/adapter. */
export async function disconnectMcpGrant(
  adapter: DBAdapter,
  userId: string,
  consentId: string,
): Promise<void> {
  await adapter.transaction(async (transaction) => {
    const consent = await transaction.findOne<{
      id: string;
      userId: string;
      clientId: string;
      scopes: string[];
    }>({
      model: 'oauthConsent',
      where: [
        { field: 'id', value: consentId },
        { field: 'userId', value: userId },
      ],
    });
    if (!consent || !consent.scopes.includes('mcp:read')) {
      throw new APIError('NOT_FOUND', { message: 'MCP connection not found' });
    }
    // One row per client: disconnect every grant for this user/client,
    // including a previous workspace selection and rotated refresh tokens.
    const where = [
      { field: 'userId', value: userId },
      { field: 'clientId', value: consent.clientId },
    ];
    await transaction.deleteMany({ model: 'oauthAccessToken', where });
    await transaction.deleteMany({ model: 'oauthRefreshToken', where });
    await transaction.deleteMany({ model: 'oauthConsent', where });
  });
}

/** The provider's delete-consent endpoint alone does not revoke tokens. */
export function mcpGrantsPlugin() {
  return {
    id: 'mcp-grants',
    endpoints: {
      disconnectMcpApp: createAuthEndpoint(
        '/mcp/disconnect',
        {
          method: 'POST',
          use: [sessionMiddleware],
          body: z.object({ consentId: z.string().min(1).max(2048) }),
        },
        async (ctx) => {
          await disconnectMcpGrant(
            ctx.context.adapter,
            ctx.context.session.user.id,
            ctx.body.consentId,
          );
          return ctx.json({ success: true });
        },
      ),
    },
  } as const;
}

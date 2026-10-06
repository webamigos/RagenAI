import { oauthProvider } from '@better-auth/oauth-provider';
import { admin } from 'better-auth/plugins';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { z } from 'zod';

/** Storage schemas come from the libraries; no OAuth issuer endpoints in admin. */
export function mcpGrantRevocationPlugin() {
  return {
    id: 'mcp-grant-revocation' as const,
    schema: {
      ...oauthProvider({
        disableJwtPlugin: true,
        loginPage: '/sign-in',
        consentPage: '/sign-in',
      }).schema,
      ...admin().schema,
    },
    endpoints: {
      revokeBannedUserMcpGrants: createAuthEndpoint.serverOnly(
        {
          method: 'POST',
          body: z.object({ userId: z.string().min(1).max(2048) }),
        },
        async (ctx) => {
          const user = await ctx.context.adapter.findOne<{ banned?: boolean }>({
            model: 'user',
            where: [{ field: 'id', value: ctx.body.userId }],
          });
          if (!user?.banned)
            throw new APIError('FORBIDDEN', {
              message: 'User must be banned before revoking grants',
            });
          await ctx.context.adapter.transaction(async (transaction) => {
            for (const model of [
              'oauthAccessToken',
              'oauthRefreshToken',
              'oauthConsent',
            ])
              await transaction.deleteMany({
                model,
                where: [{ field: 'userId', value: ctx.body.userId }],
              });
          });
          return { success: true };
        },
      ),
    },
  };
}

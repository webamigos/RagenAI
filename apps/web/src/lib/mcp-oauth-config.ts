import { getCurrentAuthContext } from '@better-auth/core/context';
import { mcpGrantsPlugin } from './mcp-grants-plugin';
import { mcp } from '@better-auth/mcp';
import { jwt } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { getOAuthProviderState } from '@better-auth/oauth-provider';
import { MCP_REGISTRATION_RATE_LIMIT } from './mcp-registration';
import { fragments, mcpOAuthRules, parseEnv } from '@ragenai/env';

/** The authorization server is present only with valid deployment configuration. */
export function mcpOAuthPlugins(
  source: Record<string, string | undefined> = process.env,
) {
  const result = parseEnv(
    fragments.mcpOAuth.superRefine(mcpOAuthRules),
    source,
  );
  if (!result.ok) {
    // The web env validator reports this on the setup page. Keep that page
    // and existing sign-in reachable, with no authorization-server plugins.
    return [] as const;
  }
  if (result.env.MCP_OAUTH_ENABLED !== 'true') {
    return [] as const;
  }
  const resource = result.env.RAGEN_MCP_PUBLIC_URL!;
  return [
    jwt(),
    mcp({
      resource,
      resources: [
        {
          identifier: resource,
          name: 'Ragen MCP',
          allowedScopes: ['openid', 'offline_access', 'mcp:read'],
        },
      ],
      scopes: ['openid', 'offline_access', 'mcp:read'],
      grantTypes: ['authorization_code', 'refresh_token'],
      accessTokenExpiresIn: 15 * 60,
      refreshTokenExpiresIn: 30 * 24 * 60 * 60,
      refreshTokenReuseInterval: 0,
      clientRegistrationRequirePKCE: true,
      rateLimit: { register: MCP_REGISTRATION_RATE_LIMIT },
      // No administrative OAuth surface is exposed to panel members.
      // The provider otherwise lets any signed-in user edit resource claims.
      clientPrivileges: async () => false,
      resourcePrivileges: async () => false,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      loginPage: '/en/sign-in',
      consentPage: '/en/connect/consent',
      postLogin: {
        page: '/en/connect/workspace',
        shouldRedirect: async ({ user, session }) => {
          const state = await getOAuthProviderState();
          const clientId = new URLSearchParams(state?.query).get('client_id');
          const context = await getCurrentAuthContext();
          // The provider clears signed-query timing before this callback.
          // Inspect the original server request, not caller-controlled headers.
          const requestPath = context.request
            ? new URL(context.request.url).pathname
            : '';
          if (!clientId || !requestPath.endsWith('/oauth2/continue'))
            return true;
          const { getMcpSelection } =
            await import('@/features/organizations/services/commands/mcp-selection-command');
          try {
            const selection = await getMcpSelection(
              { userId: user.id, sessionId: session.id },
              clientId,
            );
            return !selection;
          } catch {
            return true;
          }
        },
        consentReferenceId: async ({ user, session }) => {
          const clientId = new URLSearchParams(
            (await getOAuthProviderState())?.query,
          ).get('client_id');
          if (!clientId) {
            throw new APIError('FORBIDDEN', {
              message: 'MCP client is required',
            });
          }
          const { getMcpSelection, mcpReferenceId } =
            await import('@/features/organizations/services/commands/mcp-selection-command');
          const selection = await getMcpSelection(
            { userId: user.id, sessionId: session.id },
            clientId,
          );
          return mcpReferenceId(selection.organizationId, selection.projectId);
        },
      },
      customAccessTokenClaims: async ({ user, referenceId }) => {
        if (!user?.id || !referenceId) {
          throw new APIError('FORBIDDEN', {
            message: 'MCP workspace selection is required',
          });
        }
        const { mcpClaims } =
          await import('@/features/organizations/services/commands/mcp-selection-command');
        return mcpClaims(user?.id, referenceId);
      },
    }),
    mcpGrantsPlugin(),
  ] as const;
}

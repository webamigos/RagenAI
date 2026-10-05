import { mcp } from '@better-auth/mcp';
import { jwt } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { fragments, mcpOAuthRules, parseEnv } from '@ragenai/env';

/** Phase A installs the AS, but grants remain closed until workspace selection is wired. */
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
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      loginPage: '/en/sign-in',
      consentPage: '/en/connect/consent',
      postLogin: {
        page: '/en/connect/workspace',
        shouldRedirect: async () => true,
        consentReferenceId: async () => {
          throw new APIError('FORBIDDEN', {
            message: 'MCP workspace selection is not available yet',
          });
        },
      },
      customAccessTokenClaims: async () => {
        throw new APIError('FORBIDDEN', {
          message: 'MCP workspace selection is not available yet',
        });
      },
    }),
  ] as const;
}

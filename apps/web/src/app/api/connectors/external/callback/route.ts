import { type NextRequest, NextResponse } from 'next/server';
import { auth as mcpAuth } from '@ai-sdk/mcp';
import {
  type McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getProviderDefinition } from '@/features/connectors/constants/providers';
import { RagenAuthOAuthClientProvider } from '@/libs/ragen-vault';
import { logger } from '@/app/lib/utils/logger';
import { recordConnectorFailureCommand } from '@/features/connectors/services/commands/record-connector-failure-command';

export const dynamic = 'force-dynamic';

/**
 * Slack's token response nests user tokens under `authed_user` instead of the
 * standard top-level OAuth2 format. This function exchanges the code manually
 * and stores the tokens via the provider.
 */
async function exchangeSlackToken(
  oauthProvider: RagenAuthOAuthClientProvider,
  code: string,
  callbackUrl: string,
  clientId: string,
  clientSecret: string,
) {
  const codeVerifier = await oauthProvider.codeVerifier();

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
  });

  const response = await fetch('https://slack.com/api/oauth.v2.user.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error(`Slack token exchange HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack token exchange error: ${data.error}`);
  }

  // Slack v2 user token response: access_token is at the top level for v2_user endpoint
  const accessToken = data.access_token || data.authed_user?.access_token;
  const tokenType = data.token_type || data.authed_user?.token_type || 'bearer';
  const refreshToken = data.refresh_token || data.authed_user?.refresh_token;

  if (!accessToken) {
    throw new Error('No access_token in Slack token response');
  }

  await oauthProvider.saveTokens({
    access_token: accessToken,
    token_type: tokenType,
    refresh_token: refreshToken,
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const provider = request.nextUrl.searchParams.get(
    'provider',
  ) as McpConnectorProvider | null;

  if (!code || !provider) {
    return redirectWithStatus(request, 'error');
  }

  const providerDef = getProviderDefinition(provider);
  if (!providerDef || providerDef.authType !== 'external_mcp') {
    return redirectWithStatus(request, 'error');
  }

  let orgId: string | null = null;
  let userId: string | null = null;

  try {
    orgId = await getOrgIdFromAuthOrThrow();
    userId = await getCurrentUserId();
    if (!userId) {
      return redirectWithStatus(request, 'error');
    }

    // The callback URL is this route itself (the same URL the user is hitting now)
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
      : request.nextUrl.origin;
    const callbackUrl = `${appOrigin}/api/connectors/external/callback?provider=${provider}`;

    const oauthProvider = new RagenAuthOAuthClientProvider({
      orgId,
      userId,
      provider,
      callbackUrl,
      fixedClientId: providerDef.oauthClientId,
      fixedClientSecret: providerDef.oauthClientSecret,
    });

    // Slack uses a non-standard token response (nested under authed_user),
    // so we handle the token exchange manually instead of via mcpAuth.
    if (providerDef.useUserScope) {
      await exchangeSlackToken(
        oauthProvider,
        code,
        callbackUrl,
        providerDef.oauthClientId!,
        providerDef.oauthClientSecret!,
      );
    } else {
      const result = await mcpAuth(oauthProvider, {
        serverUrl: providerDef.mcpServerUrl,
        authorizationCode: code,
      });

      if (result !== 'AUTHORIZED') {
        await recordConnectorFailureCommand({
          organizationId: orgId,
          userId,
          provider,
          mcpServerUrl: providerDef.mcpServerUrl,
          error: new Error(
            `Authorization was not granted (mcpAuth returned "${result}")`,
          ),
          source: 'oauth_callback',
        });
        return redirectWithStatus(request, 'error');
      }
    }

    // Mark the connector as connected
    await db.mcpConnector.upsert({
      where: {
        organizationId_userId_provider: {
          organizationId: orgId,
          userId: userId,
          provider,
        },
      },
      update: {
        status: McpConnectorStatus.CONNECTED,
        connectedAt: new Date(),
      },
      create: {
        organizationId: orgId,
        userId: userId,
        provider,
        mcpServerUrl: providerDef.mcpServerUrl,
        customerId: `${orgId}:${userId}:${provider.toLowerCase()}`,
        status: McpConnectorStatus.CONNECTED,
        connectedAt: new Date(),
      },
    });

    return redirectWithStatus(request, 'success');
  } catch (error) {
    logger.error({ err: error, provider }, 'External MCP OAuth callback error');

    // Only when the identity resolved. If `getOrgIdFromAuthOrThrow` was what
    // threw there is no connector to attribute this to, and guessing one
    // would write a fault against the wrong row.
    if (orgId && userId) {
      await recordConnectorFailureCommand({
        organizationId: orgId,
        userId,
        provider,
        mcpServerUrl: providerDef.mcpServerUrl,
        error,
        source: 'oauth_callback',
      });
    }

    return redirectWithStatus(request, 'error');
  }
}

function redirectWithStatus(request: NextRequest, status: string) {
  // Extract locale from the referer or default to 'en'
  const referer = request.headers.get('referer');
  let locale = 'en';
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const pathLocale = refererUrl.pathname.split('/')[1];
      if (pathLocale === 'en' || pathLocale === 'pl') {
        locale = pathLocale;
      }
    } catch {
      // Use default locale
    }
  }

  const appOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : request.nextUrl.origin;
  const settingsUrl = new URL(`/${locale}/settings/connectors`, appOrigin);
  settingsUrl.searchParams.set('status', status);
  return NextResponse.redirect(settingsUrl);
}

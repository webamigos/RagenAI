import { type NextRequest, NextResponse } from 'next/server';
import { auth as mcpAuth } from '@ai-sdk/mcp';
import { McpConnectorStatus } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { resolveConnectorDefinitionQuery } from '@/features/connectors/services/queries/get-connector-definitions-query';
import { getConnectorOAuthCredentialsQuery } from '@/features/connectors/services/queries/get-connector-credentials-query';
import { blockedAddressReason } from '@/features/connectors/utils/refuse-blocked-address';
import { guardedAuthFetch } from '@/features/connectors/utils/guarded-auth-fetch';
import { RagenAuthOAuthClientProvider } from '@/libs/ragen-vault';
import { logger } from '@/app/lib/utils/logger';
import { recordConnectorFailureCommand } from '@/features/connectors/services/commands/record-connector-failure-command';
import { defaultLocale, locales } from '@/app/config';
import { readPublicRuntimeConfig } from '@/config/public-runtime-config';

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
  // A catalogue slug, validated by `getProviderDefinition` below.
  const provider = request.nextUrl.searchParams.get('provider');

  if (!code || !provider) {
    return redirectWithStatus(request, 'error');
  }

  let orgId: string | null = null;
  let userId: string | null = null;
  // Declared out here so the catch can still name the server the failure was
  // against; assigned inside, because the read that produces it can fail.
  let providerDef: Awaited<ReturnType<typeof resolveConnectorDefinitionQuery>> =
    undefined;

  try {
    // Inside the boundary: resolving a slug is a database read since B4. A
    // failure outside it returned a raw 500 to somebody mid-way through an
    // OAuth round trip, instead of putting them back on connector settings.
    providerDef = await resolveConnectorDefinitionQuery(provider);
    if (!providerDef || providerDef.authType !== 'external_mcp') {
      return redirectWithStatus(request, 'error');
    }

    // Again on the callback: the entry's URL can have changed between the two
    // hops, and this one exchanges a code against it.
    const blocked = blockedAddressReason(providerDef, providerDef.mcpServerUrl);
    if (blocked) {
      logger.warn(
        { provider, reason: blocked },
        'Refusing to complete OAuth against a blocked connector address',
      );
      return redirectWithStatus(request, 'error');
    }

    orgId = await getOrgIdFromAuthOrThrow();
    userId = await getCurrentUserId();
    if (!userId) {
      return redirectWithStatus(request, 'error');
    }

    // The callback URL is this route itself (the same URL the user is hitting now)
    const appOrigin = readPublicRuntimeConfig().appUrl
      ? new URL(readPublicRuntimeConfig().appUrl).origin
      : request.nextUrl.origin;
    const callbackUrl = `${appOrigin}/api/connectors/external/callback?provider=${provider}`;

    const credentials = await getConnectorOAuthCredentialsQuery(providerDef);

    const oauthProvider = new RagenAuthOAuthClientProvider({
      orgId,
      userId,
      provider,
      callbackUrl,
      fixedClientId: credentials.clientId,
      fixedClientSecret: credentials.clientSecret,
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
      // The code exchange is the same unguarded hop as discovery on the way
      // out, and this one carries the authorization code.
      const guarded = guardedAuthFetch(providerDef);
      let result;
      try {
        result = await mcpAuth(oauthProvider, {
          serverUrl: providerDef.mcpServerUrl,
          authorizationCode: code,
          ...(guarded.fetchFn && { fetchFn: guarded.fetchFn }),
        });
      } finally {
        await guarded.close();
      }

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
        organizationId_userId_providerSlug: {
          organizationId: orgId,
          userId: userId,
          providerSlug: provider,
        },
      },
      update: {
        status: McpConnectorStatus.CONNECTED,
        connectedAt: new Date(),
      },
      create: {
        organizationId: orgId,
        userId: userId,
        providerSlug: provider,
        mcpServerUrl: providerDef.mcpServerUrl,
        customerId: `${orgId}:${userId}:${provider.toLowerCase()}`,
        status: McpConnectorStatus.CONNECTED,
        connectedAt: new Date(),
      },
    });

    return redirectWithStatus(request, 'success');
  } catch (error) {
    logger.error({ err: error, provider }, 'External MCP OAuth callback error');

    // Only when the identity and the entry resolved. If
    // `getOrgIdFromAuthOrThrow` or the catalogue read was what threw there is
    // no connector to attribute this to, and guessing one would write a fault
    // against the wrong row.
    if (orgId && userId && providerDef) {
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
  // Extract locale from the referer or default to the app default
  const referer = request.headers.get('referer');
  let locale: string = defaultLocale;
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const pathLocale = refererUrl.pathname.split('/')[1];
      if ((locales as readonly string[]).includes(pathLocale)) {
        locale = pathLocale;
      }
    } catch {
      // Use default locale
    }
  }

  const appOrigin = readPublicRuntimeConfig().appUrl
    ? new URL(readPublicRuntimeConfig().appUrl).origin
    : request.nextUrl.origin;
  const settingsUrl = new URL(`/${locale}/settings/connectors`, appOrigin);
  settingsUrl.searchParams.set('status', status);
  return NextResponse.redirect(settingsUrl);
}

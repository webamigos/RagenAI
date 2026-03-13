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
import { PrismaOAuthClientProvider } from '@/libs/mcp/oauth-provider';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

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

  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();
    if (!userId) {
      return redirectWithStatus(request, 'error');
    }

    // The callback URL is this route itself (the same URL the user is hitting now)
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
      : request.nextUrl.origin;
    const callbackUrl = `${appOrigin}/api/connectors/external/callback?provider=${provider}`;

    const oauthProvider = new PrismaOAuthClientProvider({
      orgId,
      userId,
      provider,
      callbackUrl,
      fixedClientId: providerDef.oauthClientId,
      fixedClientSecret: providerDef.oauthClientSecret,
    });

    const result = await mcpAuth(oauthProvider, {
      serverUrl: providerDef.mcpServerUrl,
      authorizationCode: code,
    });

    if (result !== 'AUTHORIZED') {
      return redirectWithStatus(request, 'error');
    }

    // Mark the connector as connected
    await db.mcpConnector.upsert({
      where: {
        organization_id_user_id_provider: {
          organization_id: orgId,
          user_id: userId,
          provider,
        },
      },
      update: {
        status: McpConnectorStatus.CONNECTED,
        connected_at: new Date(),
      },
      create: {
        organization_id: orgId,
        user_id: userId,
        provider,
        mcp_server_url: providerDef.mcpServerUrl,
        customer_id: `${orgId}:${userId}:${provider.toLowerCase()}`,
        status: McpConnectorStatus.CONNECTED,
        connected_at: new Date(),
      },
    });

    return redirectWithStatus(request, 'success');
  } catch (error) {
    logger.error({ err: error, provider }, 'External MCP OAuth callback error');
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

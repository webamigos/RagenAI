import { type NextRequest, NextResponse } from 'next/server';
import { auth as mcpAuth } from '@ai-sdk/mcp';
import { type McpConnectorProvider } from '@/generated/prisma/client';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getProviderDefinition } from '@/features/connectors/constants/providers';
import { PrismaOAuthClientProvider } from '@/libs/mcp/oauth-provider';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get(
    'provider',
  ) as McpConnectorProvider | null;
  const callbackUrl = request.nextUrl.searchParams.get('callback_url');

  if (!provider || !callbackUrl) {
    return NextResponse.json(
      { error: 'Missing provider or callback_url' },
      { status: 400 },
    );
  }

  // Validate callback_url to prevent open redirects
  try {
    const parsed = new URL(callbackUrl);
    if (parsed.origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { error: 'Invalid callback_url' },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid callback_url format' },
      { status: 400 },
    );
  }

  const providerDef = getProviderDefinition(provider);
  if (!providerDef || providerDef.authType !== 'external_mcp') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    });

    if (result === 'AUTHORIZED') {
      return NextResponse.json({ status: 'already_authorized' });
    }

    const authorizationUrl = oauthProvider.authorizationUrl;
    if (!authorizationUrl) {
      return NextResponse.json(
        { error: 'Failed to get authorization URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      authorization_url: authorizationUrl.toString(),
    });
  } catch (error) {
    logger.error({ err: error, provider }, 'External MCP OAuth connect error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

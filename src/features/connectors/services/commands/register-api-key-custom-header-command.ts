'use server';

import db from '@ragenai/prisma-client';
import {
  type McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { getProviderDefinition } from '../../constants/providers';
import { ragenAuthClient } from '@/libs/ragen-vault';
import type { CustomHeaderCredentials } from '../../contracts/connector.types';
import { normalizeSiteUrl } from '../../utils/site-url';

/**
 * Register a connector that authenticates via a custom HTTP header with a
 * user-supplied site URL and two-part credential (consumer key + secret).
 *
 * Flow:
 *   1. Validate provider definition supports this auth type.
 *   2. Normalize the shop URL (HTTPS-only, no trailing slash).
 *   3. Join consumer key + secret with `:` and store as a single opaque
 *      token in Ragen Vault (encrypted at rest).
 *   4. Upsert `McpConnector` with the fully-qualified MCP endpoint
 *      (`${siteUrl}${mcpServerUrlPath}`) as `mcpServerUrl`.
 */
export const registerApiKeyCustomHeaderCommand = async (
  organizationId: string,
  userId: string,
  provider: McpConnectorProvider,
  credentials: CustomHeaderCredentials,
) => {
  const providerDef = getProviderDefinition(provider);
  if (
    !providerDef ||
    providerDef.authType !== 'api_key_custom_header' ||
    !providerDef.mcpServerUrlPath ||
    !providerDef.headerName
  ) {
    throw new Error(`Invalid provider for custom-header auth: ${provider}`);
  }

  const siteUrl = normalizeSiteUrl(credentials.siteUrl);
  const consumerKey = credentials.consumerKey?.trim() ?? '';
  const consumerSecret = credentials.consumerSecret?.trim() ?? '';

  if (!consumerKey || !consumerSecret) {
    throw new Error('Consumer key and secret are required');
  }

  const mcpServerUrl = `${siteUrl}${providerDef.mcpServerUrlPath}`;
  const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;
  const combinedToken = `${consumerKey}:${consumerSecret}`;

  // Vault write happens before the DB upsert because the DB row should
  // never point to a vault entry that doesn't exist. If the DB upsert
  // fails we best-effort roll back the vault write so a retry starts
  // from a clean state. `deleteToken` may itself fail (vault down) —
  // that's fine, the next successful `storeToken` overwrites.
  await ragenAuthClient.storeToken(customerId, provider, {
    accessToken: combinedToken,
    tokenType: 'CustomHeader',
  });

  try {
    return await db.mcpConnector.upsert({
      where: {
        organizationId_userId_provider: {
          organizationId,
          userId,
          provider,
        },
      },
      update: {
        status: McpConnectorStatus.CONNECTED,
        mcpServerUrl,
        customerId,
        connectedAt: new Date(),
      },
      create: {
        organizationId,
        userId,
        provider,
        mcpServerUrl,
        customerId,
        status: McpConnectorStatus.CONNECTED,
        connectedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        connectedAt: true,
      },
    });
  } catch (error) {
    logger.error(
      { err: error, provider },
      'Error registering custom-header connector; rolling back vault token',
    );
    try {
      await ragenAuthClient.deleteToken(customerId, provider);
    } catch (cleanupErr) {
      logger.warn(
        { err: cleanupErr, provider, customerId },
        'Failed to roll back vault token after connector upsert failure',
      );
    }
    throw error;
  }
};

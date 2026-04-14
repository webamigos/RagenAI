'use server';

import { createMCPClient } from '@ai-sdk/mcp';
import { type McpConnectorProvider } from '@/generated/prisma/client';
import { getProviderDefinition } from '../../constants/providers';
import { logger } from '@/app/lib/utils/logger';
import type { CustomHeaderCredentials } from '../../contracts/connector.types';
import { normalizeSiteUrl } from '../../utils/site-url';

export type TestConnectionResult =
  | { ok: true; toolCount: number }
  | { ok: false; error: string };

/**
 * Validate custom-header credentials against the live MCP endpoint without
 * persisting anything. Returns the discovered tool count on success so the
 * UI can confirm "we reached the server and it accepted the keys". Failure
 * messages are deliberately generic so we don't leak upstream error shapes
 * to the client.
 */
export const testCustomHeaderConnectionCommand = async (
  provider: McpConnectorProvider,
  credentials: CustomHeaderCredentials,
): Promise<TestConnectionResult> => {
  const providerDef = getProviderDefinition(provider);
  if (
    !providerDef ||
    providerDef.authType !== 'api_key_custom_header' ||
    !providerDef.mcpServerUrlPath ||
    !providerDef.headerName
  ) {
    return { ok: false, error: 'Provider does not support this auth type' };
  }

  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(credentials.siteUrl);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const consumerKey = credentials.consumerKey?.trim() ?? '';
  const consumerSecret = credentials.consumerSecret?.trim() ?? '';
  if (!consumerKey || !consumerSecret) {
    return { ok: false, error: 'Consumer key and secret are required' };
  }

  const mcpServerUrl = `${siteUrl}${providerDef.mcpServerUrlPath}`;
  const combinedToken = `${consumerKey}:${consumerSecret}`;

  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;
  try {
    client = await createMCPClient({
      transport: {
        type: 'http',
        url: mcpServerUrl,
        headers: {
          [providerDef.headerName]: combinedToken,
        },
      },
    });

    const tools = await client.tools();
    return { ok: true, toolCount: Object.keys(tools).length };
  } catch (error) {
    logger.warn(
      { err: error, provider, mcpServerUrl },
      'Custom-header connection test failed',
    );
    return {
      ok: false,
      error:
        'Could not connect to the MCP endpoint. Check the site URL and credentials.',
    };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {
        logger.warn({ err: closeErr }, 'Failed to close MCP test client');
      }
    }
  }
};

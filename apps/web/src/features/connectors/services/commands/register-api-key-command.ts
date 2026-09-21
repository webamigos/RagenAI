import { logger } from '@/app/lib/utils/logger';
import { resolveConnectorDefinitionQuery } from '../queries/get-connector-definitions-query';
import { createConnectorCommand } from './create-connector-command';
import { markConnectorConnectedCommand } from './mark-connector-connected-command';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';

/**
 * Register an API key with the external MCP service, then mark the connector as connected.
 * Used for providers that use API key auth instead of OAuth (e.g., Fireflies).
 */
export const registerApiKeyCommand = async (
  organizationId: string,
  userId: string,
  provider: string,
  apiKey: string,
) => {
  const providerDef = await resolveConnectorDefinitionQuery(provider);
  if (
    !providerDef ||
    providerDef.authType !== 'api_key' ||
    !providerDef.authPath ||
    (!providerDef.authBaseUrl && !providerDef.mcpServerUrl)
  ) {
    throw new Error(
      `Provider does not support API key registration: ${provider}`,
    );
  }

  // Step 1: Create/upsert the connector record in PENDING state
  const connector = await createConnectorCommand(
    organizationId,
    userId,
    provider,
  );

  // Step 2: Register the API key with the external MCP service
  try {
    const baseUrl = providerDef.authBaseUrl || providerDef.mcpServerUrl;
    const url = new URL(
      providerDef.authPath,
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    );

    // This POST carries the user's API key. The address it goes to comes from
    // a catalogue row, so it is one somebody typed — the same class of URL
    // `connect` guards, and it gets the same policy here.
    const response = await fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: connector.customerId,
        api_key: apiKey,
      }),
      addressGuard: providerDef.addressGuard,
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, provider },
        'API key registration failed',
      );
      throw new Error('Failed to register API key');
    }

    const data = await response.json();
    if (data.status !== 'ok') {
      throw new Error(data.message || 'Failed to register API key');
    }
  } catch (error) {
    logger.error({ err: error, provider }, 'Error registering API key');
    throw error;
  }

  // Step 3: Mark the connector as connected
  return markConnectorConnectedCommand(connector.id, organizationId, userId);
};

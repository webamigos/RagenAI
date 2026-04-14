'use server';

import { type McpConnectorProvider } from '@/generated/prisma/client';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getUserConnectorsQuery } from '@/features/connectors/services/queries/get-user-connectors-query';
import { createConnectorCommand } from '@/features/connectors/services/commands/create-connector-command';
import { markConnectorConnectedCommand } from '@/features/connectors/services/commands/mark-connector-connected-command';
import { disconnectConnectorCommand } from '@/features/connectors/services/commands/disconnect-connector-command';
import { toggleConnectorCommand } from '@/features/connectors/services/commands/toggle-connector-command';
import { registerApiKeyCommand } from '@/features/connectors/services/commands/register-api-key-command';
import { registerApiKeyBearerCommand } from '@/features/connectors/services/commands/register-api-key-bearer-command';
import { registerApiKeyCustomHeaderCommand } from '@/features/connectors/services/commands/register-api-key-custom-header-command';
import { testCustomHeaderConnectionCommand } from '@/features/connectors/services/commands/test-custom-header-connection-command';
import { getProviderDefinition } from '@/features/connectors/constants/providers';
import type { CustomHeaderCredentials } from '@/features/connectors/contracts/connector.types';

export async function getConnectors() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return getUserConnectorsQuery(orgId, userId);
}

export async function initiateConnection(provider: McpConnectorProvider) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return createConnectorCommand(orgId, userId, provider);
}

export async function confirmConnection(connectorId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return markConnectorConnectedCommand(connectorId, orgId, userId);
}

export async function disconnectProvider(connectorId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return disconnectConnectorCommand(connectorId, orgId, userId);
}

export async function toggleProvider(connectorId: string, enabled: boolean) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return toggleConnectorCommand(connectorId, orgId, userId, enabled);
}

export async function registerApiKey(
  provider: McpConnectorProvider,
  apiKey: string,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const providerDef = getProviderDefinition(provider);
  if (providerDef?.authType === 'api_key_bearer') {
    return registerApiKeyBearerCommand(orgId, userId, provider, apiKey);
  }

  return registerApiKeyCommand(orgId, userId, provider, apiKey);
}

export async function registerCustomHeaderConnection(
  provider: McpConnectorProvider,
  credentials: CustomHeaderCredentials,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return registerApiKeyCustomHeaderCommand(
    orgId,
    userId,
    provider,
    credentials,
  );
}

export async function testCustomHeaderConnection(
  provider: McpConnectorProvider,
  credentials: CustomHeaderCredentials,
) {
  // Auth check only — we don't need the IDs because nothing is persisted.
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!orgId || !userId) {
    throw new Error('Unauthorized');
  }
  return testCustomHeaderConnectionCommand(provider, credentials);
}

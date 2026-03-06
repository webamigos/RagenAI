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

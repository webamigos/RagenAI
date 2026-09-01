'use server';

import {
  type McpConnectorProvider,
  type McpConnector,
} from '@/generated/prisma/client';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type {
  ConnectorDto,
  CustomHeaderCredentials,
} from '@/features/connectors/contracts/connector.types';

// Matches ConnectorsController#create → ConnectorsService#createConnector's
// `select: { id, provider, customerId, mcpServerUrl, status }`.
type CreatedConnector = Pick<
  McpConnector,
  'id' | 'provider' | 'customerId' | 'mcpServerUrl' | 'status'
>;

// Matches the fields ConnectorsService#registerApiKeyBearer/
// #registerApiKeyCustomHeader explicitly `select`, and the subset of
// fields the un-selected (full-row) #markConnectorConnected/
// #registerApiKey results are guaranteed to share with them.
type ConnectedConnector = Pick<McpConnector, 'id' | 'status' | 'connectedAt'>;

type TestConnectionResult =
  { ok: true; toolCount: number } | { ok: false; error: string };

export async function getConnectors() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<ConnectorDto[]>({
    method: 'GET',
    path: '/v1/internal/connectors',
    userId,
    orgId,
  });
}

export async function initiateConnection(provider: McpConnectorProvider) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<CreatedConnector>({
    method: 'POST',
    path: `/v1/internal/connectors/${encodeURIComponent(provider)}`,
    userId,
    orgId,
  });
}

export async function confirmConnection(connectorId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<McpConnector>({
    method: 'POST',
    path: `/v1/internal/connectors/${encodeURIComponent(connectorId)}/confirm`,
    userId,
    orgId,
  });
}

export async function disconnectProvider(connectorId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<McpConnector>({
    method: 'DELETE',
    path: `/v1/internal/connectors/${encodeURIComponent(connectorId)}`,
    userId,
    orgId,
  });
}

export async function toggleProvider(connectorId: string, enabled: boolean) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<McpConnector>({
    method: 'POST',
    path: `/v1/internal/connectors/${encodeURIComponent(connectorId)}/toggle`,
    userId,
    orgId,
    body: { enabled },
  });
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
  // apps/api's ConnectorsController already branches between
  // registerApiKeyBearer/registerApiKey internally based on the
  // provider's authType — no need to replicate that here. The two
  // branches' return shapes only guarantee id/status/connectedAt in
  // common (see ConnectedConnector above).
  return ragenApiRequest<ConnectedConnector>({
    method: 'POST',
    path: `/v1/internal/connectors/${encodeURIComponent(provider)}/api-key`,
    userId,
    orgId,
    body: { apiKey },
  });
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
  return ragenApiRequest<ConnectedConnector>({
    method: 'POST',
    path: `/v1/internal/connectors/${encodeURIComponent(provider)}/custom-header`,
    userId,
    orgId,
    body: credentials,
  });
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
  return ragenApiRequest<TestConnectionResult>({
    method: 'POST',
    path: `/v1/internal/connectors/${encodeURIComponent(provider)}/test-custom-header`,
    userId,
    orgId,
    body: credentials,
  });
}

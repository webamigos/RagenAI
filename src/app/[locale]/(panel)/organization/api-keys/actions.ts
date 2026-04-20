'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { getApiKeysQuery } from '@/features/organizations/services/queries/get-api-keys-query';
import { createApiKeyCommand } from '@/features/organizations/services/commands/create-api-key-command';
import { removeApiKeyCommand } from '@/features/organizations/services/commands/remove-api-key-command';
import { toggleApiKeyCommand } from '@/features/organizations/services/commands/toggle-api-key-command';
import db from '@ragenai/prisma-client';

export async function getApiKeys() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getApiKeysQuery(orgId);
}

export async function createApiKey(name: string, debugMode?: boolean) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return createApiKeyCommand({ orgId, userId, name, debugMode });
}

export async function deleteApiKey(apiKeyId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return removeApiKeyCommand(orgId, apiKeyId);
}

export async function toggleApiKey(apiKeyId: string, isActive: boolean) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return toggleApiKeyCommand(orgId, apiKeyId, isActive);
}

export async function toggleDebugMode(apiKeyId: string, debugMode: boolean) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  await db.apiKey.update({
    where: { id: apiKeyId, organizationId: orgId },
    data: { debugMode },
  });
}

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
  await requireOrgAdmin();
  const orgId = await getOrgIdFromAuthOrThrow();
  return getApiKeysQuery(orgId);
}

export async function getProjects() {
  await requireOrgAdmin();
  const orgId = await getOrgIdFromAuthOrThrow();
  return db.project.findMany({
    where: { organizationId: orgId },
    select: { id: true, title: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createApiKey(name: string, projectId: string) {
  await requireOrgAdmin();
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return createApiKeyCommand({ orgId, userId, name, projectId });
}

export async function deleteApiKey(apiKeyId: string) {
  await requireOrgAdmin();
  const orgId = await getOrgIdFromAuthOrThrow();
  return removeApiKeyCommand(orgId, apiKeyId);
}

export async function toggleApiKey(apiKeyId: string, isActive: boolean) {
  await requireOrgAdmin();
  const orgId = await getOrgIdFromAuthOrThrow();
  return toggleApiKeyCommand(orgId, apiKeyId, isActive);
}

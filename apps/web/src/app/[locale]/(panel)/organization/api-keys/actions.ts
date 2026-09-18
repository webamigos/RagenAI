'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import {
  BadRequestException,
  UnauthorizedException,
} from '@/libs/utils/errors';
import { type KnowledgeScope } from '@ragenai/platform-contracts';
import { getApiKeysQuery } from '@/features/organizations/services/queries/get-api-keys-query';
import { getOrgAssistantsQuery } from '@/features/projects/services/queries/get-org-assistants-query';
import { createApiKeyCommand } from '@/features/organizations/services/commands/create-api-key-command';
import { removeApiKeyCommand } from '@/features/organizations/services/commands/remove-api-key-command';
import { toggleApiKeyCommand } from '@/features/organizations/services/commands/toggle-api-key-command';
import db from '@ragenai/prisma-client';

export async function getApiKeys() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getApiKeysQuery(orgId);
}

/** The assistants a key can be scoped to, for the creation form's picker. */
export async function getAssistantsForKeyScope() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return getOrgAssistantsQuery(orgId);
}

type CreateApiKeyArgs = {
  name: string;
  debugMode?: boolean;
  /** Omitted means `KNOWLEDGE_BASE` — see `createApiKeyCommand`. */
  knowledgeScope?: KnowledgeScope;
  /** Required by, and only valid with, an `ASSISTANT` scope. */
  projectId?: string;
};

export async function createApiKey(args: CreateApiKeyArgs) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedException('User session not found');
  }

  // The action is the trust boundary, not the form. `projectId` arrives from
  // the client and ends up as a permission boundary on the issued key, so a
  // project from another organization must not be storable — it would produce
  // a key whose scope names something its own org cannot see.
  if (args.projectId) {
    const project = await db.project.findFirst({
      where: { id: args.projectId, organizationId: orgId },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException('Unknown assistant for this organization');
    }
  }

  return createApiKeyCommand({ orgId, userId, ...args });
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

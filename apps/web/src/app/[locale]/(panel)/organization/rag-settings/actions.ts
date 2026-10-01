'use server';

import { isOnPremise } from '@ragenai/env';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import {
  getRagPipelineSettings,
  getUsageLimits,
  getModel,
} from '@/features/organizations/services/organization-settings';
import type { RagPipelineSettings } from '@/features/organizations/contracts/organization.types';
import { resolveEmbeddingsModel } from '@ragenai/rag-core';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { getOrgHasMemoriesQuery } from '@/features/memory/services/queries/get-org-has-memories-query';
import { deleteAllOrgMemoriesCommand } from '@/features/memory/services/commands/delete-all-org-memories-command';

export type RagSettingsPageData = {
  ragSettings: RagPipelineSettings;
  budgetCents: number | null;
  models: {
    embedding: string;
    reranking: string;
    rephrase: string;
    answer: string;
  };
  isOnPremise: boolean;
};

export async function getRagSettingsAction(): Promise<RagSettingsPageData> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const [ragSettings, usageLimits, answerModel] = await Promise.all([
    getRagPipelineSettings(orgId),
    getUsageLimits(orgId),
    getModel(orgId),
  ]);

  return {
    ragSettings,
    budgetCents: usageLimits.monthlyCostLimitCents,
    models: {
      embedding: resolveEmbeddingsModel(),
      reranking: 'cohere-rerank-v3-5',
      rephrase: process.env.REPHRASE_MODEL || 'gemini-2.5-flash',
      answer: answerModel || 'gemini-3-flash-preview',
    },
    isOnPremise: isOnPremise(),
  };
}

export type OrgMemoryPageData = {
  /** `personalMemory` for this organization. */
  enabled: boolean;
  /** Whether any member has memories — never what they are. */
  hasMemories: boolean;
};

/**
 * Whether to offer "delete all members' memories" (spec
 * 2026-09-27-personal-memory-across-threads, B3): while the feature is on,
 * or while memories remain after it was turned off.
 */
export async function getOrgMemoryAction(): Promise<OrgMemoryPageData> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const [enabled, hasMemories] = await Promise.all([
    isFeatureEnabledQuery(orgId, 'personalMemory'),
    getOrgHasMemoriesQuery(),
  ]);
  return { enabled, hasMemories };
}

/** Delete every member's memories in this organization, without reading them. */
export async function deleteAllMembersMemoriesAction(): Promise<{
  deletedProfiles: number;
}> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return { deletedProfiles: await deleteAllOrgMemoriesCommand() };
}

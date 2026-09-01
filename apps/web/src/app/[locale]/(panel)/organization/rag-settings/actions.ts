'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import {
  getRagPipelineSettings,
  getUsageLimits,
  getModel,
} from '@/features/organizations/services/organization-settings';
import type { RagPipelineSettings } from '@/features/organizations/contracts/organization.types';
import { resolveEmbeddingsModel } from '@ragenai/rag-core';

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
    isOnPremise: process.env.IS_ON_PREMISE === '1',
  };
}

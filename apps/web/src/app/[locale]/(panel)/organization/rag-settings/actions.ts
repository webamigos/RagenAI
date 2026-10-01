'use server';

import { isOnPremise } from '@ragenai/env';

import { logger } from '@/app/lib/utils/logger';
import {
  getCurrentUserId,
  getOrgIdFromAuthOrThrow,
} from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import {
  getRagPipelineSettings,
  getUsageLimits,
  getModel,
} from '@/features/organizations/services/organization-settings';
import type { RagPipelineSettings } from '@/features/organizations/contracts/organization.types';
import { resolveEmbeddingsModel } from '@ragenai/rag-core';
import { getContextVersionStatusQuery } from '@/features/documents/services/queries/get-context-version-status-query';
import {
  reindexForContextCommand,
  type ReindexForContextResult,
} from '@/features/documents/services/commands/reindex-for-context-command';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

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

export type ContextualChunksPageData = {
  /** `contextualChunks` for this organization: whether ingest adds a prefix. */
  enabled: boolean;
  /** Null when the index could not be read; the page says so. */
  status: { indexed: number; stale: number } | null;
};

/**
 * How many of the organization's files are indexed with the current context
 * prefix (spec 2026-09-29-contextual-chunks, C1). A failed read is reported
 * as null rather than thrown, so the rest of the page still renders.
 */
export async function getContextualChunksAction(): Promise<ContextualChunksPageData> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const [enabled, status] = await Promise.all([
    isFeatureEnabledQuery(orgId, 'contextualChunks'),
    getContextVersionStatusQuery(orgId).catch((err: unknown) => {
      logger.error({ err }, 'getContextualChunksAction: index read failed');
      return null;
    }),
  ]);

  return {
    enabled,
    status: status && { indexed: status.indexed, stale: status.stale },
  };
}

/**
 * Re-index every file below the current context version. Org admins and
 * owners only, and for the session's organization only: the stale ids are
 * computed here, never taken from the client. Refused while
 * `contextualChunks` is off, because the re-index would write no prefix.
 */
export async function reindexForContextAction(): Promise<ReindexForContextResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  if (!(await isFeatureEnabledQuery(orgId, 'contextualChunks'))) {
    throw new Error(
      'contextualChunks is off for this organization; a re-index would add no context',
    );
  }

  const { staleFileIds } = await getContextVersionStatusQuery(orgId);
  return reindexForContextCommand({
    organizationId: orgId,
    fileIds: staleFileIds,
    userId: await getCurrentUserId(),
  });
}

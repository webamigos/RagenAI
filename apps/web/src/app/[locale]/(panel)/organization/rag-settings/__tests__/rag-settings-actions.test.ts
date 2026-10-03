import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrgId = vi.hoisted(() => vi.fn());
const requireOrgAdmin = vi.hoisted(() => vi.fn());
const isFeatureEnabled = vi.hoisted(() => vi.fn());
const getRagPipelineSettings = vi.hoisted(() => vi.fn());
const getUsageLimits = vi.hoisted(() => vi.fn());
const getModel = vi.hoisted(() => vi.fn());
const isRerankingEnabled = vi.hoisted(() => vi.fn());
const getOrgGuardrails = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => getOrgId(),
  getCurrentUserId: vi.fn(),
}));
vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdmin: (orgId: string) => requireOrgAdmin(orgId),
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: isFeatureEnabled }),
);
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getRagPipelineSettings,
  getUsageLimits,
  getModel,
}));
vi.mock(
  '@/features/documents/services/queries/get-context-version-status-query',
  () => ({ getContextVersionStatusQuery: vi.fn() }),
);
vi.mock(
  '@/features/documents/services/commands/reindex-for-context-command',
  () => ({ reindexForContextCommand: vi.fn() }),
);
vi.mock('@/libs/reranker', () => ({
  rerankModelName: () => 'qwen3-embedding-8b',
  isRerankingEnabled: () => isRerankingEnabled(),
}));
vi.mock(
  '@/features/guardrails/services/queries/get-org-guardrails-query',
  () => ({ getOrgGuardrailsQuery: getOrgGuardrails }),
);
vi.mock('@ragenai/rag-core', () => ({
  resolveEmbeddingsModel: () => 'text-embedding-3-small',
}));
vi.mock('@ragenai/env', () => ({ isOnPremise: () => false }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getRagSettingsAction } from '../actions';

const ragSettings = {
  multiQueryEnabled: true,
  docSummariesEnabled: true,
  contentModerationEnabled: true,
  rerankingEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  getOrgId.mockResolvedValue('org-1');
  requireOrgAdmin.mockResolvedValue({ role: 'admin' });
  getRagPipelineSettings.mockResolvedValue(ragSettings);
  getUsageLimits.mockResolvedValue({ monthlyCostLimitCents: null });
  getModel.mockResolvedValue('gpt-5.4');
  isRerankingEnabled.mockReturnValue(false);
  getOrgGuardrails.mockResolvedValue({
    input: [],
    output: [],
    degraded: false,
    dropped: [],
  });
});

describe('getRagSettingsAction', () => {
  it('reports context expansion and section selection from their feature keys, for the session org', async () => {
    isFeatureEnabled.mockImplementation(
      async (_orgId: string, key: string) => key === 'contextExpansion',
    );

    const data = await getRagSettingsAction();

    expect(data.retrievalFeatures).toEqual({
      contextExpansion: true,
      sectionSelection: false,
    });
    expect(isFeatureEnabled).toHaveBeenCalledWith('org-1', 'contextExpansion');
    expect(isFeatureEnabled).toHaveBeenCalledWith('org-1', 'sectionSelection');
    expect(data.ragSettings).toEqual(ragSettings);
  });

  it('reports section selection when its key is on', async () => {
    isFeatureEnabled.mockResolvedValue(true);

    const data = await getRagSettingsAction();

    expect(data.retrievalFeatures).toEqual({
      contextExpansion: true,
      sectionSelection: true,
    });
  });

  it('resolves each row against the installation and the org’s guardrails', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    getRagPipelineSettings.mockResolvedValue({
      ...ragSettings,
      rerankingEnabled: true,
    });
    // A BOTH rule appears in both lists and is one rule.
    getOrgGuardrails.mockResolvedValue({
      input: [{ publicId: 'g-1' }, { publicId: 'g-2' }],
      output: [{ publicId: 'g-2' }],
      degraded: false,
      dropped: [],
    });

    const data = await getRagSettingsAction();

    expect(getOrgGuardrails).toHaveBeenCalledWith('org-1');
    // The default install: the column says on, FEATURE_FLAG_RERANKING is unset.
    expect(data.pipeline.reranking).toEqual({
      checked: false,
      note: { key: 'reranking-unavailable-note' },
    });
    expect(data.pipeline.contentModeration).toEqual({
      checked: true,
      note: { key: 'content-moderation-guardrails-note', count: 2 },
    });
  });

  it('refuses before reading anything when the caller is not an org admin', async () => {
    requireOrgAdmin.mockRejectedValue(new Error('forbidden'));

    await expect(getRagSettingsAction()).rejects.toThrow('forbidden');
    expect(isFeatureEnabled).not.toHaveBeenCalled();
  });
});

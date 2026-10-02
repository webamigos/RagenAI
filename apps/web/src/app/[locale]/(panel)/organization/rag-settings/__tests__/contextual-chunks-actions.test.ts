import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrgId = vi.hoisted(() => vi.fn());
const getUserId = vi.hoisted(() => vi.fn());
const requireOrgAdmin = vi.hoisted(() => vi.fn());
const isFeatureEnabled = vi.hoisted(() => vi.fn());
const statusQuery = vi.hoisted(() => vi.fn());
const reindexCommand = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => getOrgId(),
  getCurrentUserId: () => getUserId(),
}));
vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdmin: (orgId: string) => requireOrgAdmin(orgId),
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: isFeatureEnabled }),
);
vi.mock(
  '@/features/documents/services/queries/get-context-version-status-query',
  () => ({ getContextVersionStatusQuery: statusQuery }),
);
vi.mock(
  '@/features/documents/services/commands/reindex-for-context-command',
  () => ({ reindexForContextCommand: reindexCommand }),
);
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getRagPipelineSettings: vi.fn(),
  getUsageLimits: vi.fn(),
  getModel: vi.fn(),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getContextualChunksAction, reindexForContextAction } from '../actions';

beforeEach(() => {
  vi.clearAllMocks();
  getOrgId.mockResolvedValue('org-1');
  getUserId.mockResolvedValue('user-1');
  requireOrgAdmin.mockResolvedValue({ role: 'admin' });
  isFeatureEnabled.mockResolvedValue(true);
  statusQuery.mockResolvedValue({
    indexed: 3,
    stale: 2,
    reindexing: 0,
    staleFileIds: ['a', 'b'],
  });
  reindexCommand.mockResolvedValue({ started: 2, failed: 0 });
});

describe('getContextualChunksAction', () => {
  it('returns counts and the key, never the file ids', async () => {
    expect(await getContextualChunksAction()).toEqual({
      enabled: true,
      status: { indexed: 3, stale: 2, reindexing: 0 },
    });
    expect(requireOrgAdmin).toHaveBeenCalledWith('org-1');
    expect(statusQuery).toHaveBeenCalledWith('org-1');
  });

  it('reports an index it could not read as null instead of failing the page', async () => {
    statusQuery.mockRejectedValue(new Error('qdrant down'));
    expect((await getContextualChunksAction()).status).toBeNull();
  });

  it('refuses a member who cannot manage the organization', async () => {
    requireOrgAdmin.mockRejectedValue(new Error('Unauthorized'));
    await expect(getContextualChunksAction()).rejects.toThrow('Unauthorized');
    expect(statusQuery).not.toHaveBeenCalled();
  });
});

describe('reindexForContextAction', () => {
  it('re-indexes the stale files of the session’s organization', async () => {
    expect(await reindexForContextAction()).toEqual({ started: 2, failed: 0 });
    expect(reindexCommand).toHaveBeenCalledWith({
      organizationId: 'org-1',
      fileIds: ['a', 'b'],
      userId: 'user-1',
    });
  });

  it('refuses a member who cannot manage the organization, before reading anything', async () => {
    requireOrgAdmin.mockRejectedValue(new Error('Unauthorized'));
    await expect(reindexForContextAction()).rejects.toThrow('Unauthorized');
    expect(statusQuery).not.toHaveBeenCalled();
    expect(reindexCommand).not.toHaveBeenCalled();
  });

  it('refuses while contextualChunks is off, which would write no prefix', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    await expect(reindexForContextAction()).rejects.toThrow('contextualChunks');
    expect(reindexCommand).not.toHaveBeenCalled();
  });
});

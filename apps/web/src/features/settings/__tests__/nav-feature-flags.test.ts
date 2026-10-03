import { beforeEach, describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => ({
  features: vi.fn(),
  count: vi.fn(),
}));

vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ getEffectiveFeaturesQuery: (...x: unknown[]) => q.features(...x) }),
);
vi.mock('@/features/memory/services/queries/get-user-memories-query', () => ({
  countUserMemoriesQuery: () => q.count(),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { navFeatureFlags } from '../nav-feature-flags';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navFeatureFlags', () => {
  it('passes the flags through, without counting, when personalMemory is on', async () => {
    q.features.mockResolvedValue({ personalMemory: true, brain: false });

    expect(await navFeatureFlags('org-1')).toEqual({
      personalMemory: true,
      brain: false,
    });
    expect(q.features).toHaveBeenCalledWith('org-1');
    expect(q.count).not.toHaveBeenCalled();
  });

  it('keeps the memory page listed while the key is off and memories are stored', async () => {
    q.features.mockResolvedValue({ personalMemory: false, brain: true });
    q.count.mockResolvedValue(3);

    expect(await navFeatureFlags('org-1')).toEqual({
      personalMemory: true,
      brain: true,
    });
  });

  it('hides it when the key is off and the count is a confirmed zero', async () => {
    q.features.mockResolvedValue({ personalMemory: false });
    q.count.mockResolvedValue(0);

    expect((await navFeatureFlags('org-1')).personalMemory).toBe(false);
  });

  it('lists it when the count cannot be read: unknown is not zero', async () => {
    q.features.mockResolvedValue({ personalMemory: false, brain: true });
    q.count.mockRejectedValue(new Error('db down'));

    expect(await navFeatureFlags('org-1')).toEqual({
      personalMemory: true,
      brain: true,
    });
  });

  it('lists only the memory page when the flags cannot be read', async () => {
    q.features.mockRejectedValue(new Error('db down'));

    expect(await navFeatureFlags('org-1')).toEqual({ personalMemory: true });
  });
});

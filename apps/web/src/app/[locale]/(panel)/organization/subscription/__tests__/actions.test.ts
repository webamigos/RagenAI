import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindFirst, mockCancel, mockRequireAdmin, mockGetOrgId } =
  vi.hoisted(() => ({
    mockFindFirst: vi.fn(),
    mockCancel: vi.fn(),
    mockRequireAdmin: vi.fn(),
    mockGetOrgId: vi.fn(),
  }));

vi.mock('@ragenai/prisma-client', () => ({
  default: { subscription: { findFirst: mockFindFirst } },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: mockGetOrgId,
}));
vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdminOrAppAdmin: mockRequireAdmin,
}));
vi.mock(
  '@/features/subscriptions/services/commands/cancel-subscription',
  () => ({
    cancelSubscriptionCommand: mockCancel,
  }),
);
vi.mock(
  '@/features/subscriptions/services/queries/get-subscription-details',
  () => ({
    getSubscriptionDetailsQuery: vi.fn(),
  }),
);
vi.mock(
  '@/features/subscriptions/services/commands/activate-free-plan',
  () => ({
    activateFreePlanCommand: vi.fn(),
  }),
);

import { cancelSubscription } from '../actions';

beforeEach(() => {
  mockGetOrgId.mockReset().mockResolvedValue('org-session');
  mockRequireAdmin.mockReset().mockResolvedValue(null);
  mockFindFirst.mockReset();
  mockCancel
    .mockReset()
    .mockResolvedValue({ success: true, data: { canceledAt: null } });
});

describe('cancelSubscription and the tenant scope', () => {
  it('cancels a subscription that belongs to the session organization', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sub-row' });

    await expect(cancelSubscription('sub_own')).resolves.toEqual({
      canceledAt: null,
    });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { referenceId: 'org-session', stripeSubscriptionId: 'sub_own' },
      }),
    );
    expect(mockCancel).toHaveBeenCalledWith('sub_own');
  });

  it('does nothing for a subscription of another organization', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(cancelSubscription('sub_other')).resolves.toBeNull();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('asks for an organization admin first', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'));

    await expect(cancelSubscription('sub_own')).rejects.toThrow('Unauthorized');
    expect(mockRequireAdmin).toHaveBeenCalledWith('org-session');
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

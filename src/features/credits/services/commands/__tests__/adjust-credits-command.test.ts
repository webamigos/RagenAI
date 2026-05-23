import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockTx = {
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  creditLedgerEntry: { create: vi.fn() },
  orgCreditBalance: { update: vi.fn() },
};

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    $transaction: async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
  },
}));

const { adjustCreditsCommand } = await import('../adjust-credits-command');
const { CreditLedgerReason } = await import('@/generated/prisma/client');

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.$executeRaw.mockResolvedValue(undefined);
  mockTx.orgCreditBalance.update.mockResolvedValue(undefined);
  mockTx.creditLedgerEntry.create.mockResolvedValue({ publicId: 'l-1' });
});

describe('adjustCreditsCommand', () => {
  it('positive delta grants credits and updates lifetimeGranted', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { balance: 100, lifetime_granted: 100, lifetime_spent: 0 },
    ]);
    const result = await adjustCreditsCommand({
      organizationId: 'org_1',
      delta: 50,
      actorUserId: 'admin-1',
      note: 'Comp for outage',
    });
    expect(result.balance).toBe(150);
    expect(mockTx.orgCreditBalance.update).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
      data: { balance: 150, lifetimeGranted: 150, lifetimeSpent: 0 },
    });
    expect(mockTx.creditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: 50,
          reason: CreditLedgerReason.GRANT_ADMIN,
          note: 'Comp for outage',
          userId: 'admin-1',
        }),
      }),
    );
  });

  it('negative delta deducts but floors at 0 (never negative balance)', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { balance: 10, lifetime_granted: 100, lifetime_spent: 90 },
    ]);
    const result = await adjustCreditsCommand({
      organizationId: 'org_1',
      delta: -50,
    });
    expect(result.balance).toBe(0);
    expect(mockTx.creditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: -10,
          balanceAfter: 0,
        }),
      }),
    );
    // Deduction bumps lifetimeSpent so balance == lifetimeGranted - lifetimeSpent
    expect(mockTx.orgCreditBalance.update).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
      data: { balance: 0, lifetimeGranted: 100, lifetimeSpent: 100 },
    });
  });

  it('rejects zero delta', async () => {
    await expect(
      adjustCreditsCommand({ organizationId: 'org_1', delta: 0 }),
    ).rejects.toThrow('non-zero');
  });
});

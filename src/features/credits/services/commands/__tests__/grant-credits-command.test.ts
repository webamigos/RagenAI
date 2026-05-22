import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockTx = {
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  creditLedgerEntry: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  orgCreditBalance: {
    update: vi.fn(),
  },
};

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    $transaction: async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
  },
}));

const { grantCreditsCommand } = await import('../grant-credits-command');
const { CreditLedgerReason } = await import('@/generated/prisma/client');

const ORG = 'org_1';

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.$executeRaw.mockResolvedValue(undefined);
  mockTx.creditLedgerEntry.findUnique.mockResolvedValue(null);
  mockTx.orgCreditBalance.update.mockResolvedValue(undefined);
  mockTx.creditLedgerEntry.create.mockResolvedValue({ publicId: 'ledger-1' });
});

describe('grantCreditsCommand', () => {
  it('adds credits and bumps lifetimeGranted for additive grants', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { balance: 100, lifetime_granted: 500 },
    ]);
    const result = await grantCreditsCommand({
      organizationId: ORG,
      amount: 200,
      reason: CreditLedgerReason.GRANT_PLAN,
    });
    expect(result.balance).toBe(300);
    expect(mockTx.orgCreditBalance.update).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      data: { balance: 300, lifetimeGranted: 700 },
    });
    expect(mockTx.creditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: 200,
          balanceAfter: 300,
          reason: CreditLedgerReason.GRANT_PLAN,
        }),
      }),
    );
  });

  it('RESET overwrites balance (no carry-over) and only adds delta to lifetimeGranted', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { balance: 350, lifetime_granted: 1000 },
    ]);
    const result = await grantCreditsCommand({
      organizationId: ORG,
      amount: 500,
      reason: CreditLedgerReason.RESET,
    });
    expect(result.balance).toBe(500);
    expect(mockTx.orgCreditBalance.update).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      data: { balance: 500, lifetimeGranted: 1150 },
    });
  });

  it('RESET below current balance writes a negative delta and does not increase lifetimeGranted', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { balance: 800, lifetime_granted: 1000 },
    ]);
    await grantCreditsCommand({
      organizationId: ORG,
      amount: 500,
      reason: CreditLedgerReason.RESET,
    });
    expect(mockTx.orgCreditBalance.update).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      data: { balance: 500, lifetimeGranted: 1000 },
    });
    expect(mockTx.creditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delta: -300, balanceAfter: 500 }),
      }),
    );
  });

  it('idempotency: returns prior entry when key already exists', async () => {
    mockTx.creditLedgerEntry.findUnique.mockResolvedValue({
      publicId: 'prior',
      balanceAfter: 999,
    });
    const result = await grantCreditsCommand({
      organizationId: ORG,
      amount: 200,
      reason: CreditLedgerReason.GRANT_PLAN,
      idempotencyKey: 'stripe:invoice_xyz',
    });
    expect(result).toEqual({
      balance: 999,
      ledgerPublicId: 'prior',
      deduplicated: true,
    });
    expect(mockTx.orgCreditBalance.update).not.toHaveBeenCalled();
  });

  it('rejects non-positive amount', async () => {
    await expect(
      grantCreditsCommand({
        organizationId: ORG,
        amount: -5,
        reason: CreditLedgerReason.GRANT_ADMIN,
      }),
    ).rejects.toThrow('positive integer');
  });
});

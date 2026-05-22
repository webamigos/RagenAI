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

const { spendCreditsCommand } = await import('../spend-credits-command');
const { CreditOperation } = await import('@/generated/prisma/client');

const ORG = 'org_1';

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.$executeRaw.mockResolvedValue(undefined);
  mockTx.creditLedgerEntry.findUnique.mockResolvedValue(null);
  mockTx.orgCreditBalance.update.mockResolvedValue(undefined);
  mockTx.creditLedgerEntry.create.mockResolvedValue({
    publicId: 'ledger-pub-1',
  });
});

describe('spendCreditsCommand', () => {
  it('throws when amount is non-positive', async () => {
    await expect(
      spendCreditsCommand({
        organizationId: ORG,
        amount: 0,
        operation: CreditOperation.ENRICH_REJESTRIO,
      }),
    ).rejects.toThrow('positive integer');
  });

  it('returns insufficient when balance is below amount', async () => {
    mockTx.$queryRaw.mockResolvedValue([{ balance: 2, lifetime_spent: 10 }]);
    const result = await spendCreditsCommand({
      organizationId: ORG,
      amount: 5,
      operation: CreditOperation.ENRICH_REJESTRIO,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'insufficient',
      balance: 2,
      required: 5,
    });
    expect(mockTx.creditLedgerEntry.create).not.toHaveBeenCalled();
    expect(mockTx.orgCreditBalance.update).not.toHaveBeenCalled();
  });

  it('deducts and writes ledger entry on success', async () => {
    mockTx.$queryRaw.mockResolvedValue([{ balance: 100, lifetime_spent: 0 }]);
    const result = await spendCreditsCommand({
      organizationId: ORG,
      amount: 3,
      operation: CreditOperation.SCORE_LEAD_CRITERION,
      referenceId: 'lead-uuid',
    });
    expect(result).toMatchObject({
      ok: true,
      balance: 97,
      deduplicated: false,
    });
    expect(mockTx.orgCreditBalance.update).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      data: { balance: 97, lifetimeSpent: 3 },
    });
    expect(mockTx.creditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          delta: -3,
          balanceAfter: 97,
          operation: CreditOperation.SCORE_LEAD_CRITERION,
          referenceId: 'lead-uuid',
        }),
      }),
    );
  });

  it('returns prior result when idempotency key already exists (no double-charge)', async () => {
    mockTx.creditLedgerEntry.findUnique.mockResolvedValue({
      publicId: 'prior-ledger',
      balanceAfter: 42,
    });
    const result = await spendCreditsCommand({
      organizationId: ORG,
      amount: 5,
      operation: CreditOperation.ENRICH_REJESTRIO,
      idempotencyKey: 'enrich:lead-1:job-1',
    });
    expect(result).toEqual({
      ok: true,
      balance: 42,
      ledgerPublicId: 'prior-ledger',
      deduplicated: true,
    });
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    expect(mockTx.creditLedgerEntry.create).not.toHaveBeenCalled();
  });
});

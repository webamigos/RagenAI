import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    lead: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
    leadList: { update: (...a: unknown[]) => mockUpdate(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

import {
  markLeadScoringPendingCommand,
  completeLeadScoringCommand,
} from '../update-lead-scoring-command';
import { LeadScoringStatus } from '@/generated/prisma/client';

const lead = { id: 1, leadListId: 10, data: { company: 'Acme' } };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(lead);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockTransaction.mockImplementation(async (ops: unknown[]) => {
    for (const op of ops) {await op;}
  });
  mockUpdate.mockResolvedValue({});
});

describe('markLeadScoringPendingCommand', () => {
  it('returns true when lead transitions to pending', async () => {
    const result = await markLeadScoringPendingCommand('lead-uuid', 'org-1');
    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scoringStatus: LeadScoringStatus.pending,
        }),
      }),
    );
  });

  it('returns false when lead is already pending', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const result = await markLeadScoringPendingCommand('lead-uuid', 'org-1');
    expect(result).toBe(false);
  });

  it('throws NotFoundException when lead not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      markLeadScoringPendingCommand('bad-uuid', 'org-1'),
    ).rejects.toThrow('Lead not found');
  });
});

describe('completeLeadScoringCommand', () => {
  it('writes score and justification on success', async () => {
    await completeLeadScoringCommand('lead-uuid', 'org-1', {
      ok: true,
      score: 87,
      justification: 'Good fit',
    });
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('writes scoringError on failure', async () => {
    await completeLeadScoringCommand('lead-uuid', 'org-1', {
      ok: false,
      error: 'LLM timeout',
    });
    expect(mockTransaction).toHaveBeenCalled();
  });
});

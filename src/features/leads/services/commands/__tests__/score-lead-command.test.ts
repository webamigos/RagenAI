import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    leadList: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
  },
}));

const mockExtract = vi.fn();
vi.mock('@/features/leads/utils/extract-scoring-file-text', () => ({
  extractScoringFileText: (...a: unknown[]) => mockExtract(...a),
}));

const mockMarkPending = vi.fn();
const mockComplete = vi.fn();
vi.mock(
  '@/features/leads/services/commands/update-lead-scoring-command',
  () => ({
    markLeadScoringPendingCommand: (...a: unknown[]) => mockMarkPending(...a),
    completeLeadScoringCommand: (...a: unknown[]) => mockComplete(...a),
  }),
);

const mockGenerateObject = vi.fn();
vi.mock('ai', () => ({
  generateObject: (...a: unknown[]) => mockGenerateObject(...a),
}));

vi.mock('@/app/lib/services/llm', () => ({
  createChatCompletionInstance: vi.fn(() => ({})),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const mockTrackAiUsage = vi.fn();
vi.mock(
  '@/features/ai-usage/services/commands/create-ai-usage-command',
  () => ({
    trackAiUsage: (...a: unknown[]) => mockTrackAiUsage(...a),
  }),
);

const mockSpendCredits = vi.fn();
vi.mock('@/features/credits/services/commands/spend-credits-command', () => ({
  spendCreditsCommand: (...a: unknown[]) => mockSpendCredits(...a),
}));

const mockGetBalance = vi.fn();
vi.mock('@/features/credits/services/queries/get-balance-query', () => ({
  getBalanceQuery: (...a: unknown[]) => mockGetBalance(...a),
}));

import { scoreLeadCommand } from '../score-lead-command';
import { AiUsageStep, CreditOperation } from '@/generated/prisma/client';
import { InsufficientCreditsException } from '@/libs/utils/errors';

const leadData = {
  company: 'Acme',
  _enrichment_nip: '1234567890',
  _enrichment_przychody_pln: 5_000_000,
};

const scoringCriteria = [
  {
    key: 'typ_klienta',
    label: 'Typ klienta',
    description: '10 pkt: Duża korporacja\n4 pkt: Mała firma\n1 pkt: Startup',
    maxScore: 10,
    weight: 1.0,
  },
  {
    key: 'branza',
    label: 'Branża',
    description: '5 pkt: Ulubiona branża\n2 pkt: Neutralna\n0 pkt: Niszowa',
    maxScore: 5,
    weight: 1.0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue({
    scoringCriteria: null,
    scoringDisqualifiers: null,
    scoringFile: {
      id: 'file-uuid',
      fileName: 'scoring.pdf',
      fileType: 'PDF',
      fileExtension: 'pdf',
      organizationId: 'org-1',
    },
  });
  mockExtract.mockResolvedValue('Scoring criteria text');
  mockMarkPending.mockResolvedValue(true);
  mockGenerateObject.mockResolvedValue({
    object: { score: 82, justification: 'Good fit.' },
    usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125 },
  });
  mockComplete.mockResolvedValue(undefined);
  mockTrackAiUsage.mockResolvedValue(undefined);
  mockGetBalance.mockResolvedValue({
    organizationId: 'org-1',
    balance: 1000,
    lifetimeGranted: 1000,
    lifetimeSpent: 0,
    updatedAt: new Date(),
  });
  mockSpendCredits.mockResolvedValue({
    ok: true,
    balance: 999,
    ledgerPublicId: 'ledger-1',
    deduplicated: false,
  });
});

// ── single-prompt fallback (scoringCriteria = null) ─────────────────────────

describe('scoreLeadCommand — fallback (scoringCriteria = null)', () => {
  it('returns in_progress when lead scoring is already pending', async () => {
    mockMarkPending.mockResolvedValue(false);
    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      leadData,
      'org-1',
    );
    expect(result).toEqual({ status: 'in_progress' });
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('calls generateObject once with full criteria text', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Scoring criteria text'),
      }),
    );
  });

  it('returns scored with score and justification on success', async () => {
    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      leadData,
      'org-1',
    );
    expect(result).toEqual({
      status: 'scored',
      score: 82,
      justification: 'Good fit.',
    });
  });

  it('returns failed on LLM error', async () => {
    mockGenerateObject.mockRejectedValue(new Error('LLM timeout'));
    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      leadData,
      'org-1',
    );
    expect(result.status).toBe('failed');
  });

  it('tracks AI usage with LEAD_SCORING_SINGLE_PROMPT step', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    expect(mockTrackAiUsage).toHaveBeenCalledTimes(1);
    expect(mockTrackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        step: AiUsageStep.LEAD_SCORING_SINGLE_PROMPT,
        provider: 'litellm',
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
        metadata: expect.objectContaining({
          feature: 'lead-scoring',
          leadPublicId: 'lead-uuid',
          leadListPublicId: 'list-uuid',
        }),
      }),
    );
  });

  it('spends 1 credit on successful single-prompt scoring with stable idempotency key', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    expect(mockSpendCredits).toHaveBeenCalledTimes(1);
    expect(mockSpendCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        amount: 1,
        operation: CreditOperation.SCORE_LEAD_SINGLE_PROMPT,
        referenceId: 'lead-uuid',
        idempotencyKey: 'score:single:lead-uuid',
      }),
    );
  });

  it('does not spend credits when generateObject fails (no charge on failure)', async () => {
    mockGenerateObject.mockRejectedValue(new Error('LLM timeout'));
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    expect(mockSpendCredits).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when list has no scoring file', async () => {
    mockFindFirst.mockResolvedValue({
      scoringCriteria: null,
      scoringDisqualifiers: null,
      scoringFile: null,
    });
    await expect(
      scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1'),
    ).rejects.toThrow('No scoring file');
  });
});

// ── parse-then-score (scoringCriteria present) ───────────────────────────────

describe('scoreLeadCommand — parse-then-score (scoringCriteria present)', () => {
  beforeEach(() => {
    mockFindFirst.mockResolvedValue({
      scoringCriteria,
      scoringDisqualifiers: null,
      scoringFile: {
        id: 'file-uuid',
        fileName: 'scoring.pdf',
        fileType: 'PDF',
        fileExtension: 'pdf',
        organizationId: 'org-1',
      },
    });
    // Per-criterion calls return points + justification
    mockGenerateObject.mockResolvedValue({
      object: { points: 8, justification: 'Dobra firma.' },
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
    });
  });

  it('calls generateObject N times (one per criterion)', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    expect(mockGenerateObject).toHaveBeenCalledTimes(scoringCriteria.length);
  });

  it('each call prompt contains criterion label and lead data', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    const calls = mockGenerateObject.mock.calls;
    expect(calls[0][0].prompt).toContain('Typ klienta');
    expect(calls[0][0].prompt).toContain('Acme');
    expect(calls[1][0].prompt).toContain('Branża');
  });

  it('aggregates score correctly (maxScore is the Max column, no weight multiplication)', async () => {
    // typ_klienta: points=4, maxScore=10
    // branza:      points=4, maxScore=5
    // totalPoints = 4 + 4 = 8
    // totalMax    = 10 + 5 = 15
    // finalScore  = round(8/15 * 100) = round(53.3) = 53
    mockGenerateObject.mockResolvedValue({
      object: { points: 4, justification: 'Dobra firma.' },
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
    });
    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      leadData,
      'org-1',
    );
    expect(result).toMatchObject({ status: 'scored', score: 53 });
  });

  it('partial failure: one criterion fails → status scored, not failed', async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: { points: 8, justification: 'Ok.' },
        usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
      })
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      leadData,
      'org-1',
    );
    expect(result.status).toBe('scored');
  });

  it('tracks AI usage with LEAD_SCORING_CRITERION step per criterion', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    const criterionCalls = mockTrackAiUsage.mock.calls.filter(
      ([arg]) => arg.step === AiUsageStep.LEAD_SCORING_CRITERION,
    );
    expect(criterionCalls).toHaveLength(scoringCriteria.length);
    expect(criterionCalls[0][0]).toMatchObject({
      organizationId: 'org-1',
      provider: 'litellm',
      inputTokens: 80,
      outputTokens: 20,
      totalTokens: 100,
      metadata: expect.objectContaining({
        feature: 'lead-scoring',
        leadPublicId: 'lead-uuid',
        leadListPublicId: 'list-uuid',
        criterionKey: scoringCriteria[0].key,
      }),
    });
  });

  it('tracks AI usage with LEAD_SCORING_DISQUALIFIER step when disqualifiers present', async () => {
    mockFindFirst.mockResolvedValue({
      scoringCriteria,
      scoringDisqualifiers: ['w likwidacji'],
      scoringFile: {
        id: 'file-uuid',
        fileName: 'scoring.pdf',
        fileType: 'PDF',
        fileExtension: 'pdf',
        organizationId: 'org-1',
      },
    });
    mockGenerateObject.mockResolvedValue({
      object: { isDisqualified: false, reason: '' },
      usage: { inputTokens: 60, outputTokens: 15, totalTokens: 75 },
    });

    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');

    const disqCalls = mockTrackAiUsage.mock.calls.filter(
      ([arg]) => arg.step === AiUsageStep.LEAD_SCORING_DISQUALIFIER,
    );
    expect(disqCalls).toHaveLength(1);
    expect(disqCalls[0][0]).toMatchObject({
      organizationId: 'org-1',
      provider: 'litellm',
      inputTokens: 60,
      outputTokens: 15,
      totalTokens: 75,
    });
  });

  it('does not track LEAD_SCORING_DISQUALIFIER when no disqualifiers configured', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    const disqCalls = mockTrackAiUsage.mock.calls.filter(
      ([arg]) => arg.step === AiUsageStep.LEAD_SCORING_DISQUALIFIER,
    );
    expect(disqCalls).toHaveLength(0);
  });

  it('spends 1 credit per successful criterion (idempotent per criterion key)', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    const criterionSpends = mockSpendCredits.mock.calls.filter(
      ([arg]) => arg.operation === CreditOperation.SCORE_LEAD_CRITERION,
    );
    expect(criterionSpends).toHaveLength(scoringCriteria.length);
    expect(criterionSpends[0][0]).toMatchObject({
      organizationId: 'org-1',
      amount: 1,
      referenceId: 'lead-uuid',
      idempotencyKey: `score:crit:lead-uuid:${scoringCriteria[0].key}`,
    });
  });

  it('does not spend for failed criterion calls (no charge on failure)', async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: { points: 8, justification: 'Ok.' },
        usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
      })
      .mockRejectedValueOnce(new Error('timeout'));

    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    const criterionSpends = mockSpendCredits.mock.calls.filter(
      ([arg]) => arg.operation === CreditOperation.SCORE_LEAD_CRITERION,
    );
    // Only the one that succeeded gets charged
    expect(criterionSpends).toHaveLength(1);
  });

  it('throws InsufficientCreditsException before doing any work when balance is too low', async () => {
    mockGetBalance.mockResolvedValue({
      organizationId: 'org-1',
      balance: 1,
      lifetimeGranted: 1,
      lifetimeSpent: 0,
      updatedAt: new Date(),
    });

    await expect(
      scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1'),
    ).rejects.toBeInstanceOf(InsufficientCreditsException);

    expect(mockMarkPending).not.toHaveBeenCalled();
    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(mockSpendCredits).not.toHaveBeenCalled();
  });

  it('estimates cost including disqualifier when configured', async () => {
    mockFindFirst.mockResolvedValue({
      scoringCriteria,
      scoringDisqualifiers: ['w likwidacji'],
      scoringFile: {
        id: 'file-uuid',
        fileName: 'scoring.pdf',
        fileType: 'PDF',
        fileExtension: 'pdf',
        organizationId: 'org-1',
      },
    });
    // 2 criteria + 1 disqualifier = 3 required, balance = 2 → insufficient.
    mockGetBalance.mockResolvedValue({
      organizationId: 'org-1',
      balance: 2,
      lifetimeGranted: 2,
      lifetimeSpent: 0,
      updatedAt: new Date(),
    });

    await expect(
      scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1'),
    ).rejects.toBeInstanceOf(InsufficientCreditsException);
  });

  it('disqualifier match → score=0 justification starts with DYSKWALIFIKACJA', async () => {
    mockFindFirst.mockResolvedValue({
      scoringCriteria,
      scoringDisqualifiers: ['w likwidacji'],
      scoringFile: {
        id: 'file-uuid',
        fileName: 'scoring.pdf',
        fileType: 'PDF',
        fileExtension: 'pdf',
        organizationId: 'org-1',
      },
    });
    // Disqualifier check call returns isDisqualified: true
    mockGenerateObject.mockResolvedValue({
      object: {
        isDisqualified: true,
        reason: 'Firma jest w likwidacji.',
      },
      usage: { inputTokens: 60, outputTokens: 15, totalTokens: 75 },
    });

    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      { ...leadData, _enrichment_w_likwidacji: true },
      'org-1',
    );
    expect(result).toMatchObject({ status: 'scored', score: 0 });
    expect((result as { justification: string }).justification).toContain(
      'DYSKWALIFIKACJA',
    );
  });
});

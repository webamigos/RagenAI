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

import { scoreLeadCommand } from '../score-lead-command';

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
  });
  mockComplete.mockResolvedValue(undefined);
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
      .mockResolvedValueOnce({ object: { points: 8, justification: 'Ok.' } })
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      leadData,
      'org-1',
    );
    expect(result.status).toBe('scored');
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

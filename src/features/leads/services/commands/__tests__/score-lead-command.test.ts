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
  _enrichment_przychody_pln: 5000000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue({
    scoringFile: {
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

describe('scoreLeadCommand', () => {
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

  it('calls generateObject with criteria text and lead data', async () => {
    await scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1');
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Scoring criteria text'),
      }),
    );
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Acme'),
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
    expect(mockComplete).toHaveBeenCalledWith('lead-uuid', 'org-1', {
      ok: true,
      score: 82,
      justification: 'Good fit.',
    });
  });

  it('returns failed and calls complete with error on LLM failure', async () => {
    mockGenerateObject.mockRejectedValue(new Error('LLM timeout'));
    const result = await scoreLeadCommand(
      'lead-uuid',
      'list-uuid',
      leadData,
      'org-1',
    );
    expect(result.status).toBe('failed');
    expect(mockComplete).toHaveBeenCalledWith('lead-uuid', 'org-1', {
      ok: false,
      error: 'LLM timeout',
    });
  });

  it('throws BadRequestException when list has no scoring file', async () => {
    mockFindFirst.mockResolvedValue({ scoringFile: null });
    await expect(
      scoreLeadCommand('lead-uuid', 'list-uuid', leadData, 'org-1'),
    ).rejects.toThrow('No scoring file');
  });
});

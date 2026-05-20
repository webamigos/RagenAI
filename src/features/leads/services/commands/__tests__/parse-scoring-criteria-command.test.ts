import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    leadList: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

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

import { parseScoringCriteriaCommand } from '../parse-scoring-criteria-command';

const validCriteria = [
  {
    key: 'typ_klienta',
    label: 'Typ i skala klienta',
    description: '0–5 pkt: mała firma. 6–10 pkt: duża firma.',
    maxScore: 10,
    weight: 1.5,
  },
  {
    key: 'branża',
    label: 'Branża',
    description: '0–5 pkt: inna. 6–10 pkt: IT.',
    maxScore: 10,
    weight: 1.0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue({ id: 42 });
  mockGenerateObject.mockResolvedValue({
    object: { criteria: validCriteria, disqualifiers: ['w likwidacji'] },
  });
  mockUpdate.mockResolvedValue({});
});

describe('parseScoringCriteriaCommand', () => {
  it('calls generateObject with criteria text in prompt', async () => {
    await parseScoringCriteriaCommand('rubric text', 'org-1', 'list-uuid');
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('rubric text'),
      }),
    );
  });

  it('saves parsed criteria and disqualifiers to LeadList on success', async () => {
    await parseScoringCriteriaCommand('rubric text', 'org-1', 'list-uuid');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        scoringCriteria: validCriteria,
        scoringDisqualifiers: ['w likwidacji'],
        scoringCriteriaError: null,
      },
    });
  });

  it('saves scoringCriteriaError and does NOT throw when LLM fails', async () => {
    mockGenerateObject.mockRejectedValue(new Error('LLM unavailable'));
    await expect(
      parseScoringCriteriaCommand('rubric text', 'org-1', 'list-uuid'),
    ).resolves.not.toThrow();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        scoringCriteria: expect.anything(),
        scoringDisqualifiers: expect.anything(),
        scoringCriteriaError: 'LLM unavailable',
      },
    });
  });

  it('throws NotFoundException when list not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      parseScoringCriteriaCommand('rubric text', 'org-1', 'list-uuid'),
    ).rejects.toThrow('Lead list not found');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});

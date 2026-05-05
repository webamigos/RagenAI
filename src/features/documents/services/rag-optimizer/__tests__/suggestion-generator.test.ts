import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateObject = vi.fn();
vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { generateSuggestions } from '../suggestion-generator';
import type { LanguageModelV3 } from '@ai-sdk/provider';

const mockModel = {} as LanguageModelV3;

describe('generateSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed suggestions from LLM', async () => {
    const suggestion = {
      id: 'sug-1',
      type: 'restructure',
      location: 'Section 1',
      before: 'Old text',
      after: 'New text',
      rationale: 'Better chunking',
      expectedScoreDelta: 10,
    };
    mockGenerateObject.mockResolvedValueOnce({
      object: { suggestions: [suggestion] },
    });

    const result = await generateSuggestions('Document content', mockModel);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(suggestion);
  });

  it('throws when LLM fails', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('LLM error'));

    await expect(generateSuggestions('content', mockModel)).rejects.toThrow(
      'LLM error',
    );
  });
});

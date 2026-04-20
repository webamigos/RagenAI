import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateObject = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    object: {
      chunkStructure: 8,
      avgChunkSize: 7,
      entityDensity: 9,
      selfContainedness: 6,
      qaAdherence: 8,
      total: 76,
      suggestions: ['Add more contact info per section'],
    },
  }),
);

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { scoreDocument } from '../document-scorer';
import type { LanguageModelV3 } from '@ai-sdk/provider';

const mockModel = {} as LanguageModelV3;

describe('scoreDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid RagScore with server-recomputed total', async () => {
    const result = await scoreDocument('Some document content', mockModel);

    // total is recomputed server-side: 8*2.5 + 7*1.5 + 9*2 + 6*2.5 + 8*1.5 = 75.5 → 76
    expect(result).toEqual({
      chunkStructure: 8,
      avgChunkSize: 7,
      entityDensity: 9,
      selfContainedness: 6,
      qaAdherence: 8,
      total: 76,
      suggestions: ['Add more contact info per section'],
    });
  });

  it('calls generateObject with correct parameters', async () => {
    await scoreDocument('Test content', mockModel);

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.model).toBe(mockModel);
    expect(call.system).toContain('RAG quality evaluator');
    expect(call.messages[0].content).toContain('Test content');
    expect(call.experimental_telemetry).toEqual({
      isEnabled: true,
      functionId: 'kb-document-scorer',
      recordInputs: false,
      recordOutputs: false,
    });
  });

  it('truncates content longer than 12,000 characters', async () => {
    const longContent = 'x'.repeat(15_000);
    await scoreDocument(longContent, mockModel);

    const call = mockGenerateObject.mock.calls[0][0];
    const userMessage = call.messages[0].content as string;
    const prefix = 'Evaluate the following document for RAG readiness:\n\n';
    expect(userMessage.length).toBe(prefix.length + 12_000);
    expect(userMessage.startsWith(prefix)).toBe(true);
    expect(userMessage).toContain('x'.repeat(12_000));
    expect(userMessage).not.toContain('x'.repeat(12_001));
  });

  it('throws when generateObject fails', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(scoreDocument('content', mockModel)).rejects.toThrow(
      'LLM timeout',
    );
  });
});

const mockGenerateText = vi.fn();
const mockRerankDocuments = vi.fn();

vi.mock('ai', async () => ({
  ...(await vi.importActual('ai')),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));
vi.mock('../../reranker/index.js', () => ({
  rerankDocuments: (...args: unknown[]) => mockRerankDocuments(...args),
  isRerankingEnabled: () => true,
}));

import type { LanguageModelV4 } from '@ai-sdk/provider';
import {
  retrieveRelevantDocumentsWithIds,
  sectionSelectionCall,
} from './operations.js';
import type { VectorStoreClient } from '../../vector-store/types.js';

const chunk = (n: number) => ({
  pageContent: `Passage ${n}.`,
  metadata: { file_id: `f-${n}`, chunk_index: 1 },
});
const pool = [1, 2, 3, 4, 5, 6].map(chunk);

function store(): VectorStoreClient {
  return {
    similaritySearch: vi.fn(() => Promise.resolve(pool)),
    addDocuments: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * `sectionSelection` (spec 2026-09-29-llm-document-selection, D1), the same
 * behaviour as apps/web's chain: both call rag-core's `selectSections`.
 */
describe('retrieveRelevantDocumentsWithIds — section selection', () => {
  it('keeps what the model chose, in its order, and the reranker does not run', async () => {
    const { fileIds } = await retrieveRelevantDocumentsWithIds(
      store(),
      'q',
      2,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      { generate: () => Promise.resolve('5, 2') },
    );
    expect(mockRerankDocuments).not.toHaveBeenCalled();
    expect(fileIds).toEqual(['f-5', 'f-2']);
  });

  it('answers from fusion order when the selector fails', async () => {
    const { fileIds } = await retrieveRelevantDocumentsWithIds(
      store(),
      'q',
      2,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      { generate: () => Promise.reject(new Error('provider down')) },
    );
    expect(fileIds).toEqual(['f-1', 'f-2']);
  });
});

describe('sectionSelectionCall', () => {
  const model = { modelId: 'mistral-small-3.2' } as LanguageModelV4;

  it('asks at temperature 0 and records SECTION_SELECTION through the callback', async () => {
    mockGenerateText.mockResolvedValue({
      text: '1',
      usage: { inputTokens: 10, outputTokens: 1 },
    });
    const trackAiUsage = vi.fn(() => Promise.resolve());

    const text = await sectionSelectionCall(
      model,
      { organizationId: 'org-1' },
      trackAiUsage,
    )({ system: 's', prompt: 'p' });

    expect(text).toBe('1');
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0, prompt: 'p' }),
    );
    expect(trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        step: 'SECTION_SELECTION',
        totalTokens: 11,
      }),
    );
  });
});

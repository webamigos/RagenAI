import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockCreateVersion = vi.fn();
const mockApplySuggestions = vi.fn();
const mockScoreDocument = vi.fn();
const mockTrackAiUsage = vi.fn();
const mockCreateChatInstance = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userDocument: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
    userFile: { findFirst: vi.fn() },
    documentVersion: { updateMany: vi.fn() },
  },
}));

vi.mock('../create-document-version-command', () => ({
  createDocumentVersionCommand: (...a: unknown[]) => mockCreateVersion(...a),
}));

vi.mock(
  '@/features/documents/services/rag-optimizer/suggestion-applier',
  () => ({
    applySuggestions: (...a: unknown[]) => mockApplySuggestions(...a),
  }),
);

vi.mock('@/features/documents/services/rag-optimizer/document-scorer', () => ({
  scoreDocument: (...a: unknown[]) => mockScoreDocument(...a),
}));

vi.mock(
  '@/features/ai-usage/services/commands/create-ai-usage-command',
  () => ({
    trackAiUsage: (...a: unknown[]) => mockTrackAiUsage(...a),
  }),
);

vi.mock('@/app/lib/services/llm', () => ({
  createChatCompletionInstanceWithOrg: (...a: unknown[]) =>
    mockCreateChatInstance(...a),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { applySuggestionsCommand } from '../apply-suggestions-command';

describe('applySuggestionsCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies accepted suggestions and creates new version', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 'doc-1',
      content: 'original',
      title: 'Title',
    });
    mockApplySuggestions.mockReturnValueOnce('improved content');
    mockCreateVersion.mockResolvedValueOnce({
      id: 'ver-new',
      versionNumber: 2,
    });
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockCreateChatInstance.mockResolvedValueOnce({});
    mockScoreDocument.mockResolvedValueOnce({
      total: 85,
      chunkStructure: 8,
      avgChunkSize: 7,
      entityDensity: 8,
      selfContainedness: 9,
      qaAdherence: 6,
      suggestions: [],
    });

    const result = await applySuggestionsCommand({
      documentId: 'doc-1',
      orgId: 'org-1',
      authorId: 'user-1',
      acceptedSuggestionIds: ['sug-1'],
      suggestions: [
        {
          id: 'sug-1',
          type: 'terminology',
          location: 'sec',
          before: 'original',
          after: 'improved content',
          rationale: 'better',
          expectedScoreDelta: 5,
        },
      ],
    });

    expect(mockApplySuggestions).toHaveBeenCalled();
    expect(mockCreateVersion).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'AI_OPTIMIZE' }),
    );
    expect(result.newVersionId).toBe('ver-new');
  });

  it('throws when document not found', async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      applySuggestionsCommand({
        documentId: 'doc-999',
        orgId: 'org-1',
        authorId: 'user-1',
        acceptedSuggestionIds: [],
        suggestions: [],
      }),
    ).rejects.toThrow('Document not found');
  });
});

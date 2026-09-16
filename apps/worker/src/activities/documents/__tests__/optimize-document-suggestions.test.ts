import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the case that only became reachable when the document text stopped
 * riding in the job payload: the document can be deleted between enqueue and
 * run. `reindexDocumentVersion` refuses it; this had to as well.
 */

const getDocumentContent = vi.hoisted(() => vi.fn());
const updateOptimizationJobFields = vi.hoisted(() =>
  vi.fn(async () => undefined),
);

vi.mock('../../../services/db/db.js', () => ({
  db: { getDocumentContent, updateOptimizationJobFields },
}));

vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn(async () => ({ id: 'model' })),
}));
vi.mock('../../../services/langfuse-trace.js', () => ({
  withLangfuseTrace: vi.fn(async (_meta: unknown, fn: () => unknown) => fn()),
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('../evaluate-suggestion-dimensions.js', () => ({
  evaluateSuggestionDimensions: vi.fn(),
}));

const { optimizeDocumentSuggestions } =
  await import('../optimize-document-suggestions.js');

const params = {
  jobId: 'job-1',
  documentId: 'doc-1',
  orgId: 'org-1',
};

beforeEach(() => vi.clearAllMocks());

describe('when the document has gone missing since the job was queued', () => {
  it('refuses non-retryably — a deleted document does not come back', async () => {
    getDocumentContent.mockResolvedValue(null);

    await expect(optimizeDocumentSuggestions(params)).rejects.toMatchObject({
      name: 'JobFailure',
      retryable: false,
    });
  });

  /**
   * Every write below the guard targets `user_documents.metadata` for this id,
   * so marking the job failed would write nowhere — and the job would read
   * `processing` for good. Refusing before anything is touched is the point.
   */
  it('does not mark the job processing on the way out', async () => {
    getDocumentContent.mockResolvedValue(null);

    await optimizeDocumentSuggestions(params).catch(() => undefined);

    expect(updateOptimizationJobFields).not.toHaveBeenCalled();
  });

  it('reads the document it was told to optimize', async () => {
    getDocumentContent.mockResolvedValue(null);

    await optimizeDocumentSuggestions(params).catch(() => undefined);

    expect(getDocumentContent).toHaveBeenCalledWith('doc-1', 'org-1');
  });
});

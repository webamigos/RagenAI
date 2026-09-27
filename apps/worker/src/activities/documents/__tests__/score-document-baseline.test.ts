import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  getDocumentContent: vi.fn(),
  getFileIdForDocument: vi.fn(),
  mergeFileMetadata: vi.fn(async () => 1),
}));
const isRagScoringEnabled = vi.hoisted(() => vi.fn(async () => true));
const scoreDocumentForRag = vi.hoisted(() => vi.fn());
const syncRagScoreToVersion = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../../services/db/db.js', () => ({ db }));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../is-rag-scoring-enabled.js', () => ({ isRagScoringEnabled }));
vi.mock('../score-document-for-rag.js', () => ({ scoreDocumentForRag }));
vi.mock('../../db/sync-rag-score-to-version.js', () => ({
  syncRagScoreToVersion,
}));

const { scoreDocumentBaseline } = await import('../score-document-baseline.js');

const params = { documentId: 'doc-1', orgId: 'org-1', projectId: null };
const SCORE = { total: 62, dimensions: {} };

beforeEach(() => {
  vi.clearAllMocks();
  isRagScoringEnabled.mockResolvedValue(true);
  db.getDocumentContent.mockResolvedValue({
    content: 'Regulamin.',
    title: 'R',
  });
  db.getFileIdForDocument.mockResolvedValue('file-1');
  scoreDocumentForRag.mockResolvedValue(SCORE);
});

describe('scoreDocumentBaseline', () => {
  it('scores the decrypted text and stores it on the file and the version', async () => {
    await expect(scoreDocumentBaseline(params)).resolves.toBe(62);

    expect(db.getDocumentContent).toHaveBeenCalledWith('doc-1', 'org-1');
    expect(scoreDocumentForRag).toHaveBeenCalledWith(
      expect.objectContaining({ documentText: 'Regulamin.', orgId: 'org-1' }),
    );
    expect(db.mergeFileMetadata).toHaveBeenCalledWith({
      where: { fileId: 'file-1', orgId: 'org-1' },
      patch: { ragScore: SCORE, ragScoredAt: expect.any(String) },
    });
    expect(syncRagScoreToVersion).toHaveBeenCalledWith({
      documentId: 'doc-1',
      orgId: 'org-1',
      ragScore: SCORE,
    });
  });

  it('makes no model call where the organization does not score', async () => {
    isRagScoringEnabled.mockResolvedValue(false);

    await expect(scoreDocumentBaseline(params)).resolves.toBeNull();
    expect(db.getDocumentContent).not.toHaveBeenCalled();
    expect(scoreDocumentForRag).not.toHaveBeenCalled();
  });

  it.each([
    ['gone', null],
    ['blank', { content: ' \n ', title: null }],
  ])('returns null for a document that is %s', async (_, document) => {
    db.getDocumentContent.mockResolvedValue(document);

    await expect(scoreDocumentBaseline(params)).resolves.toBeNull();
    expect(scoreDocumentForRag).not.toHaveBeenCalled();
  });

  it('writes nothing when the model returns no score', async () => {
    scoreDocumentForRag.mockResolvedValue(null);

    await expect(scoreDocumentBaseline(params)).resolves.toBeNull();
    expect(db.mergeFileMetadata).not.toHaveBeenCalled();
    expect(syncRagScoreToVersion).not.toHaveBeenCalled();
  });

  it('stores it on the version alone for a document with no file', async () => {
    db.getFileIdForDocument.mockResolvedValue(null);

    await expect(scoreDocumentBaseline(params)).resolves.toBe(62);
    expect(db.mergeFileMetadata).not.toHaveBeenCalled();
    expect(syncRagScoreToVersion).toHaveBeenCalled();
  });
});

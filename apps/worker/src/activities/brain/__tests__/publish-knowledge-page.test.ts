import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The publication write (spec E2). What it pins: chunks carry the page's own
 * `accessibleBy`, a stale generation writes nothing, a run that goes stale
 * while writing removes its chunks, and a retry starts by deleting.
 */
const db = vi.hoisted(() => ({
  getPageForPublication: vi.fn(),
  currentPublicationGeneration: vi.fn(),
  completePublication: vi.fn(),
}));
const qdrant = vi.hoisted(() => ({
  deleteByFileId: vi.fn(),
  deleteBrainChunks: vi.fn(),
  addDocuments: vi.fn(),
}));
const vectors = vi.hoisted(() => ({ addDocumentsToVectorStore: vi.fn() }));
vi.mock('../../../services/db/brain-publication.js', () => db);
vi.mock('../../../services/qdrant.js', () => ({ qdrantService: qdrant }));
vi.mock('../../meilisearch/add-documents-to-vector-store.js', () => vectors);
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { publishKnowledgePage } from '../publish-knowledge-page.js';

const PAGE = {
  id: 7,
  publicId: 'page-7',
  title: 'Urlop',
  content:
    '# Urlop\n\nOpis.\n\n- Przysługuje 26 dni. [1]\n\n---\n\n1. „26 dni”\n',
  accessibleBy: ['team:hr', 'user:anna'],
  publishedAt: new Date(),
  publicationGeneration: 3,
  publishedFileId: 'file-7',
  fileName: 'urlop.md',
};
const input = { orgId: 'org-1', pageId: 'page-7', generation: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  db.getPageForPublication.mockResolvedValue(PAGE);
  db.currentPublicationGeneration.mockResolvedValue(3);
  db.completePublication.mockResolvedValue(true);
});

describe('publishKnowledgePage', () => {
  it('writes the page with its own access, after clearing the file’s old chunks', async () => {
    await expect(publishKnowledgePage(input)).resolves.toEqual({
      status: 'published',
      chunks: 1,
    });
    // This generation and older, never a newer run's chunks.
    expect(qdrant.deleteBrainChunks).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: 'file-7',
      generation: 3,
      scope: 'upTo',
    });
    expect(qdrant.deleteByFileId).not.toHaveBeenCalled();
    const { docs, orgId, projectId } =
      vectors.addDocumentsToVectorStore.mock.calls[0]![0];
    expect({ orgId, projectId }).toEqual({ orgId: 'org-1', projectId: null });
    expect(docs[0].metadata).toMatchObject({
      file_id: 'file-7',
      organization_id: 'org-1',
      accessible_by: ['team:hr', 'user:anna'],
      section_path: 'Urlop',
      brain_generation: 3,
    });
    expect(docs[0].pageContent).toContain('Przysługuje 26 dni');
    expect(db.completePublication).toHaveBeenCalledWith({
      orgId: 'org-1',
      pageId: 7,
      fileId: 'file-7',
      generation: 3,
    });
    // Delete strictly before the write.
    expect(qdrant.deleteBrainChunks.mock.invocationCallOrder[0]).toBeLessThan(
      vectors.addDocumentsToVectorStore.mock.invocationCallOrder[0]!,
    );
  });

  it('writes nothing for a generation that is no longer current', async () => {
    db.getPageForPublication.mockResolvedValue({
      ...PAGE,
      publicationGeneration: 4,
    });
    await expect(publishKnowledgePage(input)).resolves.toEqual({
      status: 'stale',
      chunks: 0,
    });
    expect(vectors.addDocumentsToVectorStore).not.toHaveBeenCalled();
    // The newer run owns the file; nothing of it is touched.
    expect(qdrant.deleteByFileId).not.toHaveBeenCalled();
    expect(qdrant.deleteBrainChunks).not.toHaveBeenCalled();
  });

  it('writes nothing for a page that was withdrawn, and clears what an earlier attempt left', async () => {
    db.getPageForPublication.mockResolvedValue({ ...PAGE, publishedAt: null });
    await expect(publishKnowledgePage(input)).resolves.toMatchObject({
      status: 'stale',
    });
    expect(vectors.addDocumentsToVectorStore).not.toHaveBeenCalled();
    expect(qdrant.deleteByFileId).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: 'file-7',
    });
  });

  it('takes back only its own chunks when a newer publication lands while it writes', async () => {
    db.currentPublicationGeneration.mockResolvedValue(4);
    await expect(publishKnowledgePage(input)).resolves.toMatchObject({
      status: 'stale',
    });
    // By generation, not by file: generation 4's chunks are the page's now.
    expect(qdrant.deleteBrainChunks).toHaveBeenLastCalledWith({
      orgId: 'org-1',
      fileId: 'file-7',
      generation: 3,
      scope: 'only',
    });
    expect(qdrant.deleteByFileId).not.toHaveBeenCalled();
    expect(db.completePublication).not.toHaveBeenCalled();
  });

  it('takes its chunks back when the completing write finds it lost', async () => {
    db.completePublication.mockResolvedValue(false);
    await expect(publishKnowledgePage(input)).resolves.toMatchObject({
      status: 'stale',
    });
    expect(qdrant.deleteBrainChunks).toHaveBeenLastCalledWith(
      expect.objectContaining({ generation: 3, scope: 'only' }),
    );
  });

  it('answers missing for a page with no publication file', async () => {
    db.getPageForPublication.mockResolvedValue({
      ...PAGE,
      publishedFileId: null,
    });
    await expect(publishKnowledgePage(input)).resolves.toMatchObject({
      status: 'missing',
    });
  });
});

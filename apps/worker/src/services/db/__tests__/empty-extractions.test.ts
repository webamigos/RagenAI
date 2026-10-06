import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  knowledgeFinding: { findMany: vi.fn() },
  userFile: { findMany: vi.fn() },
}));
const brain = vi.hoisted(() => ({
  hasPagesFromFile: vi.fn(),
  recordExtractionFailed: vi.fn(),
}));
vi.mock('../prisma.js', () => ({ getPrisma: () => prisma }));
vi.mock('../brain.js', () => brain);
import { reconcileEmptyExtractions } from '../empty-extractions.js';

beforeEach(() => {
  vi.clearAllMocks();
  prisma.knowledgeFinding.findMany.mockReset();
  prisma.knowledgeFinding.findMany
    .mockResolvedValue([])
    .mockResolvedValueOnce([
      { fileId: 'f1', detail: { runId: 'finished-run' } },
    ]);
  prisma.userFile.findMany.mockResolvedValue([{ id: 'f1' }]);
  brain.hasPagesFromFile.mockResolvedValue(false);
});

describe('reconcileEmptyExtractions', () => {
  it('flags a completed file whose finished extraction resolved a finding without creating pages', async () => {
    expect(await reconcileEmptyExtractions('org-1')).toBe(1);
    expect(prisma.knowledgeFinding.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        type: 'EXTRACTION_FAILED',
        status: 'RESOLVED',
        fileId: { not: null },
      },
      distinct: ['fileId'],
      select: { fileId: true, detail: true },
    });
    expect(prisma.userFile.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        id: { in: ['f1'] },
        embeddingStatus: 'COMPLETED',
      },
      select: { id: true },
    });
    expect(brain.recordExtractionFailed).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: 'f1',
      detail: {
        reason: 'nothing_extracted',
        windowIndex: null,
        runId: 'finished-run',
      },
    });
  });

  it('leaves documents with pages alone', async () => {
    brain.hasPagesFromFile.mockResolvedValue(true);
    expect(await reconcileEmptyExtractions('org-1')).toBe(0);
    expect(brain.recordExtractionFailed).not.toHaveBeenCalled();
  });

  it('does not infer an extraction attempt from embedding completion alone', async () => {
    prisma.knowledgeFinding.findMany.mockReset().mockResolvedValue([]);
    expect(await reconcileEmptyExtractions('org-1')).toBe(0);
    expect(prisma.userFile.findMany).not.toHaveBeenCalled();
  });

  it('leaves deleted or non-completed files alone', async () => {
    prisma.userFile.findMany.mockResolvedValue([]);
    expect(await reconcileEmptyExtractions('org-1')).toBe(0);
    expect(brain.recordExtractionFailed).not.toHaveBeenCalled();
  });

  it.each(['OPEN', 'DISMISSED'])(
    'does not refresh or reopen an existing %s failure',
    async (status) => {
      prisma.knowledgeFinding.findMany.mockResolvedValue([
        { fileId: 'f1', status },
      ]);
      expect(await reconcileEmptyExtractions('org-1')).toBe(0);
      expect(brain.recordExtractionFailed).not.toHaveBeenCalled();
      expect(prisma.knowledgeFinding.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          type: 'EXTRACTION_FAILED',
          status: { in: ['OPEN', 'DISMISSED'] },
          fileId: { in: ['f1'] },
        },
        select: { fileId: true },
      });
    },
  );
});

import { beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePageSource: { findMany: vi.fn() },
  knowledgeFinding: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const { getBrainDocumentExtractionQuery } =
  await import('../services/queries/get-brain-document-extraction-query');

beforeEach(() => {
  vi.resetAllMocks();
  db.knowledgePageSource.findMany.mockResolvedValue([]);
  db.knowledgeFinding.findMany.mockResolvedValue([]);
});

it('reads sources of all statuses and only open extraction failures within the organization and files', async () => {
  db.knowledgePageSource.findMany.mockResolvedValue([{ fileId: 'a' }]);
  db.knowledgeFinding.findMany.mockResolvedValue([
    {
      fileId: 'b',
      publicId: 'finding-b',
      detail: { reason: 'nothing_extracted' },
    },
    {
      fileId: 'c',
      publicId: 'finding-c',
      detail: { reason: 'provider_error' },
    },
  ]);
  const result = await getBrainDocumentExtractionQuery('session-org', [
    'a',
    'b',
    'c',
    'd',
  ]);
  expect(result.get('a')).toEqual({ hasPages: true, failure: null });
  expect(result.get('b')).toEqual({
    hasPages: false,
    failure: { publicId: 'finding-b', empty: true },
  });
  expect(result.get('c')?.failure).toEqual({
    publicId: 'finding-c',
    empty: false,
  });
  expect(result.get('d')).toEqual({ hasPages: false, failure: null });
  expect(db.knowledgePageSource.findMany).toHaveBeenCalledWith({
    where: {
      organizationId: 'session-org',
      fileId: { in: ['a', 'b', 'c', 'd'] },
    },
    distinct: ['fileId'],
    select: { fileId: true },
  });
  expect(db.knowledgeFinding.findMany.mock.calls[0][0].where).toEqual({
    organizationId: 'session-org',
    fileId: { in: ['a', 'b', 'c', 'd'] },
    type: 'EXTRACTION_FAILED',
    status: 'OPEN',
  });
});

it('handles missing or malformed finding detail without inventing an empty extraction', async () => {
  db.knowledgeFinding.findMany.mockResolvedValue([
    { fileId: 'a', publicId: 'failure', detail: null },
  ]);
  expect(
    (await getBrainDocumentExtractionQuery('org', ['a'])).get('a')?.failure
      ?.empty,
  ).toBe(false);
});

it('does not scan when no files are visible', async () => {
  expect(await getBrainDocumentExtractionQuery('org', [])).toEqual(new Map());
  expect(db.knowledgePageSource.findMany).not.toHaveBeenCalled();
  expect(db.knowledgeFinding.findMany).not.toHaveBeenCalled();
});

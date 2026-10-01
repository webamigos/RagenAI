import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const startFileReindex = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { userFile: { findMany, updateMany } },
}));
vi.mock('../start-file-reindex-command', () => ({
  startFileReindexCommand: startFileReindex,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { reindexForContextCommand } from '../reindex-for-context-command';

const ORG = 'org-1';
const file = (id: string) => ({
  id,
  fileName: `${id}.pdf`,
  projectId: 'p-1',
  parsingStatus: 'COMPLETED',
  embeddingStatus: 'COMPLETED',
  workflowId: `old-${id}`,
});

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  startFileReindex.mockReset().mockResolvedValue('runFileEmbeddings');
});

describe('reindexForContextCommand', () => {
  it('looks the files up under the organization, never by id alone', async () => {
    findMany.mockResolvedValue([]);
    await reindexForContextCommand({
      organizationId: ORG,
      fileIds: ['a', 'other-orgs-file'],
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      id: { in: ['a', 'other-orgs-file'] },
      publishedPages: { none: {} },
    });
  });

  it('resets each file with its run id before starting it', async () => {
    findMany.mockResolvedValue([file('a')]);
    const order: string[] = [];
    updateMany.mockImplementation(async () => {
      order.push('reset');
      return { count: 1 };
    });
    startFileReindex.mockImplementation(async ({ workflowId }) => {
      order.push(`start ${workflowId.startsWith('reindex-context-')}`);
      return 'runFileEmbeddings';
    });

    const result = await reindexForContextCommand({
      organizationId: ORG,
      fileIds: ['a'],
    });

    expect(result).toEqual({ started: 1, failed: 0 });
    expect(order).toEqual(['reset', 'start true']);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'a', organizationId: ORG },
      data: { parsingStatus: 'NOT_STARTED', embeddingStatus: 'NOT_STARTED' },
    });
    expect(startFileReindex.mock.calls[0][0]).toMatchObject({
      organizationId: ORG,
      file: { id: 'a' },
    });
  });

  it('puts the previous status back when a start fails, and goes on', async () => {
    findMany.mockResolvedValue([file('a'), file('b')]);
    startFileReindex
      .mockRejectedValueOnce(new Error('redis unreachable'))
      .mockResolvedValueOnce('runFileEmbeddings');

    const result = await reindexForContextCommand({
      organizationId: ORG,
      fileIds: ['a', 'b'],
    });

    expect(result).toEqual({ started: 1, failed: 1 });
    const restore = updateMany.mock.calls[1][0];
    expect(restore.where).toMatchObject({ id: 'a', organizationId: ORG });
    expect(restore.where.workflowId).toMatch(/^reindex-context-/);
    expect(restore.data).toEqual({
      parsingStatus: 'COMPLETED',
      embeddingStatus: 'COMPLETED',
      workflowId: 'old-a',
    });
    expect(startFileReindex).toHaveBeenCalledTimes(2);
  });
});

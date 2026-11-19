import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.hoisted(() => vi.fn());
const start = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@ragenai/prisma-client', () => ({
  default: { documentVersion: { findFirst } },
}));
vi.mock('@/libs/jobs', () => ({ jobs: () => ({ start }) }));

import { ChangeType } from '@/generated/prisma/client';
import { startFileReindexCommand } from '../start-file-reindex-command';

const file = { id: 'file-1', fileName: 'regulamin.pdf', projectId: null };
const input = { file, organizationId: 'org-1', workflowId: 'run-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startFileReindexCommand', () => {
  // The job is chosen now and may run later. The flag is what has the worker
  // look at the active version again before it parses the stored upload.
  it('tells the re-parse job to keep the active version', async () => {
    findFirst.mockResolvedValue({
      documentId: 'doc-1',
      changeType: ChangeType.UPLOAD,
    });

    expect(await startFileReindexCommand(input)).toBe('runFileEmbeddings');
    expect(start).toHaveBeenCalledWith('runFileEmbeddings', 'run-1', {
      fileId: 'file-1',
      orgId: 'org-1',
      keepActiveVersion: true,
    });
  });

  it('reads the active version inside the organization', async () => {
    findFirst.mockResolvedValue(null);

    await startFileReindexCommand(input);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          isActive: true,
          document: { fileId: 'file-1', organizationId: 'org-1' },
        },
      }),
    );
  });

  it('starts the version re-index for an edited document', async () => {
    findFirst.mockResolvedValue({
      documentId: 'doc-1',
      changeType: ChangeType.MANUAL,
    });

    expect(await startFileReindexCommand(input)).toBe('reindexDocumentVersion');
    expect(start).toHaveBeenCalledWith('reindexDocumentVersion', 'run-1', {
      orgId: 'org-1',
      fileId: 'file-1',
      fileName: 'regulamin.pdf',
      projectId: null,
      userId: null,
      documentId: 'doc-1',
    });
  });
});

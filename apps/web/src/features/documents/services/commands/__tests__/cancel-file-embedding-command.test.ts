import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

const mockSignal = vi.fn();
const mockGetHandle = vi.fn((..._args: unknown[]) => ({
  signal: (...args: unknown[]) => mockSignal(...args),
}));
vi.mock('@/libs/temporal', () => ({
  getTemporalClient: () => ({
    workflow: { getHandle: (...args: unknown[]) => mockGetHandle(...args) },
  }),
  ACTIVITY_CANCEL_EMBEDDING_COMMAND: 'cancelEmbedding',
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { cancelFileEmbeddingCommand } from '../cancel-file-embedding-command';
import { NotFoundException } from '@/libs/utils/errors';

describe('cancelFileEmbeddingCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignal.mockResolvedValue(undefined);
  });

  it('signals cancelEmbedding on the workflow recorded for this file, scoped by org', async () => {
    mockFindFirst.mockResolvedValue({ workflowId: 'doc-abc123' });

    await cancelFileEmbeddingCommand('file-1', 'org-1');

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      select: { workflowId: true },
    });
    expect(mockGetHandle).toHaveBeenCalledWith('doc-abc123');
    expect(mockSignal).toHaveBeenCalledWith('cancelEmbedding');
  });

  it('throws NotFoundException when the file does not exist (or belongs to another org)', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      cancelFileEmbeddingCommand('missing-file', 'org-1'),
    ).rejects.toThrow(NotFoundException);
    expect(mockGetHandle).not.toHaveBeenCalled();
  });

  it('throws when the file has no recorded workflowId', async () => {
    mockFindFirst.mockResolvedValue({ workflowId: null });

    await expect(cancelFileEmbeddingCommand('file-1', 'org-1')).rejects.toThrow(
      'no recorded embedding workflow',
    );
    expect(mockGetHandle).not.toHaveBeenCalled();
  });

  it('maps a WorkflowNotFoundError to NotFoundException', async () => {
    mockFindFirst.mockResolvedValue({ workflowId: 'doc-abc123' });
    mockSignal.mockRejectedValue(
      Object.assign(new Error('not found'), { name: 'WorkflowNotFoundError' }),
    );

    await expect(cancelFileEmbeddingCommand('file-1', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('re-throws other signal failures', async () => {
    mockFindFirst.mockResolvedValue({ workflowId: 'doc-abc123' });
    mockSignal.mockRejectedValue(new Error('temporal unavailable'));

    await expect(cancelFileEmbeddingCommand('file-1', 'org-1')).rejects.toThrow(
      'temporal unavailable',
    );
  });
});

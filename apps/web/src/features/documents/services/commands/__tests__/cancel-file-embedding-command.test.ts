import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

const mockRequestCancel = vi.fn();
vi.mock('@/libs/jobs', () => ({
  jobs: () => ({ requestCancel: mockRequestCancel }),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { cancelFileEmbeddingCommand } from '../cancel-file-embedding-command';
import { NotFoundException } from '@/libs/utils/errors';

/**
 * Cancellation is a database fact now, not a Temporal signal. These assert the
 * three properties the exchange was made for — the status is written here so
 * the UI flips immediately, a run the engine has forgotten is not an error,
 * and a finished ingest is not resurrected — plus the one thing the engine
 * still owns, dropping a job that has not started.
 */
describe('cancelFileEmbeddingCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockRequestCancel.mockResolvedValue(undefined);
  });

  it('throws when the file is not in this organization', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      cancelFileEmbeddingCommand('file-1', 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('cancels the parsing phase while parsing is still live', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: 'doc-1',
      parsingStatus: 'STARTED',
    });

    await cancelFileEmbeddingCommand('file-1', 'org-1');

    const call = mockUpdateMany.mock.calls[0][0];
    expect(call.data.parsingStatus).toBe('CANCELLED');
    expect(call.where.parsingStatus.notIn).toContain('COMPLETED');
  });

  it('cancels the embedding phase once parsing has finished', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: 'doc-1',
      parsingStatus: 'COMPLETED',
    });

    await cancelFileEmbeddingCommand('file-1', 'org-1');

    const call = mockUpdateMany.mock.calls[0][0];
    expect(call.data.embeddingStatus).toBe('CANCELLED');
    expect(call.where.embeddingStatus.notIn).toContain('COMPLETED');
  });

  it('scopes the write to the organization, so a cancel cannot cross orgs', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: 'doc-1',
      parsingStatus: 'STARTED',
    });

    await cancelFileEmbeddingCommand('file-1', 'org-1');

    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: 'file-1',
      organizationId: 'org-1',
    });
  });

  it('asks the runtime to drop a job that has not started yet', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: 'doc-1',
      parsingStatus: 'STARTED',
    });

    await cancelFileEmbeddingCommand('file-1', 'org-1');

    expect(mockRequestCancel).toHaveBeenCalledWith('doc-1');
  });

  it('does not throw when the ingest had already finished — nothing to stop', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: 'doc-1',
      parsingStatus: 'STARTED',
    });
    // The pipeline's own COMPLETED write won the race.
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      cancelFileEmbeddingCommand('file-1', 'org-1'),
    ).resolves.toBeUndefined();
    // Nothing was stopped, so the runtime is not asked to drop anything.
    expect(mockRequestCancel).not.toHaveBeenCalled();
  });

  it('records the cancellation even when no run id was ever stored', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: null,
      parsingStatus: 'STARTED',
    });

    await expect(
      cancelFileEmbeddingCommand('file-1', 'org-1'),
    ).resolves.toBeUndefined();
    expect(mockUpdateMany).toHaveBeenCalled();
    expect(mockRequestCancel).not.toHaveBeenCalled();
  });

  it('keeps the cancellation when the runtime cannot be reached', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: 'doc-1',
      parsingStatus: 'STARTED',
    });
    mockRequestCancel.mockRejectedValue(new Error('temporal down'));

    // The row is CANCELLED, so the user's intent is recorded; an unreachable
    // engine must not report the request as failed.
    await expect(
      cancelFileEmbeddingCommand('file-1', 'org-1'),
    ).resolves.toBeUndefined();
  });
});

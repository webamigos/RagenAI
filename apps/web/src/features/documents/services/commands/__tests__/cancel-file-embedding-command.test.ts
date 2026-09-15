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
      embeddingStatus: 'NOT_STARTED',
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
      embeddingStatus: 'STARTED',
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
      embeddingStatus: 'NOT_STARTED',
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
      embeddingStatus: 'NOT_STARTED',
    });

    await cancelFileEmbeddingCommand('file-1', 'org-1');

    expect(mockRequestCancel).toHaveBeenCalledWith('doc-1');
  });

  it('does not throw when the ingest had already finished — nothing to stop', async () => {
    mockFindFirst.mockResolvedValue({
      workflowId: 'doc-1',
      parsingStatus: 'STARTED',
      embeddingStatus: 'NOT_STARTED',
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
      embeddingStatus: 'NOT_STARTED',
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
      embeddingStatus: 'NOT_STARTED',
    });
    mockRequestCancel.mockRejectedValue(new Error('temporal down'));

    // The row is CANCELLED, so the user's intent is recorded; an unreachable
    // engine must not report the request as failed.
    await expect(
      cancelFileEmbeddingCommand('file-1', 'org-1'),
    ).resolves.toBeUndefined();
  });
  // A phase the run never reached has nothing to cancel. Writing CANCELLED to
  // it would leave a status nobody can interpret, and would make a second
  // cancel of an already cancelled file write to the *other* column instead of
  // doing nothing.
  describe('the phase a cancel is written to', () => {
    it.each([
      ['a failed parse', 'FAILED'],
      ['an already cancelled parse', 'CANCELLED'],
    ])('writes nothing after %s', async (_label, parsingStatus) => {
      mockFindFirst.mockResolvedValue({
        workflowId: 'doc-1',
        parsingStatus,
        embeddingStatus: 'NOT_STARTED',
      });

      await cancelFileEmbeddingCommand('file-1', 'org-1');

      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockRequestCancel).not.toHaveBeenCalled();
    });

    it('writes nothing when both phases are already finished', async () => {
      mockFindFirst.mockResolvedValue({
        workflowId: 'doc-1',
        parsingStatus: 'COMPLETED',
        embeddingStatus: 'COMPLETED',
      });

      await cancelFileEmbeddingCommand('file-1', 'org-1');

      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  // The pipeline can cross from parsing into embedding between the read and
  // the write. Without the retry the cancel matches no rows and is reported as
  // "already finished" while the ingest carries on embedding — the user's
  // click does nothing and nothing says so.
  describe('when the pipeline changes phase mid-cancel', () => {
    it('retries against the phase that is live now', async () => {
      mockFindFirst
        .mockResolvedValueOnce({
          workflowId: 'doc-1',
          parsingStatus: 'STARTED',
          embeddingStatus: 'NOT_STARTED',
        })
        // Re-read after the parsing write matched nothing: parsing finished
        // and embedding started while we were writing.
        .mockResolvedValueOnce({
          parsingStatus: 'COMPLETED',
          embeddingStatus: 'STARTED',
        });
      mockUpdateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await cancelFileEmbeddingCommand('file-1', 'org-1');

      expect(mockUpdateMany).toHaveBeenCalledTimes(2);
      expect(mockUpdateMany.mock.calls[0][0].data.parsingStatus).toBe(
        'CANCELLED',
      );
      expect(mockUpdateMany.mock.calls[1][0].data.embeddingStatus).toBe(
        'CANCELLED',
      );
      // The cancellation landed, so the queued-job half still runs.
      expect(mockRequestCancel).toHaveBeenCalledWith('doc-1');
    });

    it('gives up after the second attempt rather than looping', async () => {
      mockFindFirst.mockResolvedValue({
        workflowId: 'doc-1',
        parsingStatus: 'STARTED',
        embeddingStatus: 'NOT_STARTED',
      });
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await cancelFileEmbeddingCommand('file-1', 'org-1');

      // Two phases means a second transition cannot overtake the retry, so
      // there is nothing a third attempt could find.
      expect(mockUpdateMany).toHaveBeenCalledTimes(2);
      expect(mockRequestCancel).not.toHaveBeenCalled();
    });
  });
});

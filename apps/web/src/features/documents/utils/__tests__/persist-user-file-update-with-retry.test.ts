import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

const mockWarn = vi.fn();
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args) },
}));

import { persistUserFileUpdateWithRetry } from '../persist-user-file-update-with-retry';

describe('persistUserFileUpdateWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the update by id and organizationId and returns on first success', async () => {
    mockUpdate.mockResolvedValue({});

    await persistUserFileUpdateWithRetry({
      fileId: 'file-1',
      organizationId: 'org-1',
      data: { workflowId: 'wf-1' },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: { workflowId: 'wf-1' },
    });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('retries a transient failure and succeeds without logging a warning', async () => {
    mockUpdate
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce({});

    await persistUserFileUpdateWithRetry({
      fileId: 'file-1',
      organizationId: 'org-1',
      data: { workflowId: 'wf-1' },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('gives up after exhausting retries, logs a warning, and does not throw', async () => {
    mockUpdate.mockRejectedValue(new Error('db unreachable'));

    await expect(
      persistUserFileUpdateWithRetry({
        fileId: 'file-1',
        organizationId: 'org-1',
        data: { workflowId: 'wf-1' },
        logContext: { workflowId: 'wf-1' },
      }),
    ).resolves.toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'file-1', workflowId: 'wf-1' }),
      expect.any(String),
    );
  });
});

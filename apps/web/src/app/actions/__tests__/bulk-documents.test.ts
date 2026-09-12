import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks (must be declared before any imports of the tested module) ---

const mockGetOrgIdFromAuthOrThrow = vi.fn();
const mockGetCurrentUserId = vi.fn();
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => mockGetOrgIdFromAuthOrThrow(),
  getCurrentUserId: () => mockGetCurrentUserId(),
}));

const mockGetActiveMember = vi.fn();
vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: (...args: unknown[]) => mockGetActiveMember(...args),
}));

vi.mock('@/lib/auth-access-control', () => ({
  canManageOrg: (role: string) => role === 'admin' || role === 'owner',
}));

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

const mockDeleteFileCommand = vi.fn();
vi.mock('@/features/documents/services/commands/delete-file-command', () => ({
  deleteFileCommand: (...args: unknown[]) => mockDeleteFileCommand(...args),
}));

const mockRagenApiRequest = vi.fn();
vi.mock('@/libs/ragen-api-client/client', () => ({
  ragenApiRequest: (...args: unknown[]) => mockRagenApiRequest(...args),
}));

const mockGetTemporalClient = vi.fn();
vi.mock('@/libs/temporal', () => ({
  getTemporalClient: () => mockGetTemporalClient(),
  TASK_QUEUE_NAME: 'test-queue',
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// --- import after mocks ---
import {
  bulkDeleteFilesAction,
  bulkMoveFilesToFolderAction,
  bulkShareFilesAction,
  bulkReembedFilesAction,
  bulkUpdatePiiPolicyAction,
} from '../bulk-documents';
import { PiiPolicy } from '@/generated/prisma/client';

describe('bulkDeleteFilesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
    mockGetActiveMember.mockResolvedValue({ role: 'member' });
  });

  it('deletes owned files successfully', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      ownerId: 'user-1',
      fileName: 'doc.pdf',
    });
    mockDeleteFileCommand.mockResolvedValue({
      deleted: true,
      fileId: 'file-1',
      fileName: 'doc.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-1']);

    expect(result.succeeded).toEqual(['file-1']);
    expect(result.failed).toHaveLength(0);
  });

  it('adds insufficient_permissions to failed when user is not owner and not admin', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-2',
      ownerId: 'other-user',
      fileName: 'secret.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-2']);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toEqual([
      {
        fileId: 'file-2',
        fileName: 'secret.pdf',
        error: 'insufficient_permissions',
      },
    ]);
    expect(mockDeleteFileCommand).not.toHaveBeenCalled();
  });

  it('org admin can delete any file', async () => {
    mockGetActiveMember.mockResolvedValue({ role: 'admin' });
    mockFindFirst.mockResolvedValue({
      id: 'file-3',
      ownerId: 'other-user',
      fileName: 'any.pdf',
    });
    mockDeleteFileCommand.mockResolvedValue({
      deleted: true,
      fileId: 'file-3',
      fileName: 'any.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-3']);

    expect(result.succeeded).toEqual(['file-3']);
  });

  it('partial success: one file succeeds, one missing returns not-found error', async () => {
    mockFindFirst
      .mockResolvedValueOnce({
        id: 'file-1',
        ownerId: 'user-1',
        fileName: 'a.pdf',
      })
      .mockResolvedValueOnce(null);
    mockDeleteFileCommand.mockResolvedValue({
      deleted: true,
      fileId: 'file-1',
      fileName: 'a.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-1', 'file-missing']);

    expect(result.succeeded).toEqual(['file-1']);
    expect(result.failed).toEqual([
      { fileId: 'file-missing', fileName: 'file-missing', error: 'not_found' },
    ]);
  });
});

describe('bulkMoveFilesToFolderAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
    mockGetActiveMember.mockResolvedValue({ role: 'member' });
  });

  it('moves owned files to folder successfully', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      ownerId: 'user-1',
      fileName: 'doc.pdf',
    });
    mockRagenApiRequest.mockResolvedValue({ success: true });

    const result = await bulkMoveFilesToFolderAction(
      ['file-1', 'file-2'],
      'folder-1',
    );

    expect(result.succeeded).toEqual(['file-1', 'file-2']);
    expect(result.failed).toHaveLength(0);
    expect(mockRagenApiRequest).toHaveBeenCalledTimes(2);
  });

  it('collects error when the move request fails', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-bad',
      ownerId: 'user-1',
      fileName: 'any.pdf',
    });
    mockRagenApiRequest.mockResolvedValue({
      success: false,
      error: 'Folder not found',
    });

    const result = await bulkMoveFilesToFolderAction(
      ['file-bad'],
      'folder-nonexistent',
    );

    expect(result.failed).toEqual([
      { fileId: 'file-bad', fileName: 'any.pdf', error: 'Folder not found' },
    ]);
  });

  it('adds insufficient_permissions when user is not owner and not admin', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-other',
      ownerId: 'other-user',
      fileName: 'secret.pdf',
    });

    const result = await bulkMoveFilesToFolderAction(
      ['file-other'],
      'folder-1',
    );

    expect(result.failed).toEqual([
      {
        fileId: 'file-other',
        fileName: 'secret.pdf',
        error: 'insufficient_permissions',
      },
    ]);
    expect(mockRagenApiRequest).not.toHaveBeenCalled();
  });
});

describe('bulkShareFilesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
    mockGetActiveMember.mockResolvedValue({ role: 'member' });
  });

  it('shares owned files successfully', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      ownerId: 'user-1',
      fileName: 'doc.pdf',
    });
    mockRagenApiRequest.mockResolvedValue({ success: true });

    const result = await bulkShareFilesAction(
      ['file-1'],
      'user',
      'grantee-1',
      'view',
    );

    expect(result.succeeded).toEqual(['file-1']);
    expect(mockRagenApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/internal/files/file-1/share',
        userId: 'user-1',
        orgId: 'org-1',
        body: {
          granteeType: 'user',
          granteeId: 'grantee-1',
          permission: 'view',
        },
      }),
    );
  });

  it('adds insufficient_permissions when user is not owner and not admin', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-other',
      ownerId: 'other-user',
      fileName: 'secret.pdf',
    });

    const result = await bulkShareFilesAction(
      ['file-other'],
      'user',
      'grantee-1',
      'view',
    );

    expect(result.failed).toEqual([
      {
        fileId: 'file-other',
        fileName: 'secret.pdf',
        error: 'insufficient_permissions',
      },
    ]);
    expect(mockRagenApiRequest).not.toHaveBeenCalled();
  });

  it('throws when user is not authenticated', async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    await expect(
      bulkShareFilesAction(['file-1'], 'user', 'grantee-1', 'view'),
    ).rejects.toThrow('Unauthenticated');
  });
});

describe('bulkReembedFilesAction', () => {
  const mockWorkflowStart = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
    mockWorkflowStart.mockResolvedValue(undefined);
    mockGetTemporalClient.mockReturnValue({
      workflow: { start: mockWorkflowStart },
    });
    mockUpdate.mockResolvedValue(undefined);
  });

  it('starts workflow and updates status per file after success', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'file-1',
        fileName: 'doc.pdf',
        organizationId: 'org-1',
        projectId: null,
      },
    ]);

    const result = await bulkReembedFilesAction(['file-1']);

    expect(result.succeeded).toEqual(['file-1']);
    expect(result.failed).toHaveLength(0);
    expect(mockWorkflowStart).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-1' },
        data: expect.objectContaining({ embeddingStatus: 'NOT_STARTED' }),
      }),
    );
  });

  it('does NOT update status when workflow start fails', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'file-2',
        fileName: 'bad.pdf',
        organizationId: 'org-1',
        projectId: null,
      },
    ]);
    mockWorkflowStart.mockRejectedValue(new Error('Temporal down'));

    const result = await bulkReembedFilesAction(['file-2']);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toEqual([
      { fileId: 'file-2', fileName: 'bad.pdf', error: 'workflow_start_failed' },
    ]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reports not_found for fileIds missing from DB', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await bulkReembedFilesAction(['ghost-file']);

    expect(result.failed).toEqual([
      { fileId: 'ghost-file', fileName: 'ghost-file', error: 'not_found' },
    ]);
  });
});

describe('bulkUpdatePiiPolicyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
    mockGetActiveMember.mockResolvedValue({ role: 'admin' });
  });

  it('sets the policy on every file it finds', async () => {
    mockFindFirst.mockResolvedValue({ id: 'file-1', fileName: 'doc.pdf' });
    mockUpdate.mockResolvedValue({});

    const result = await bulkUpdatePiiPolicyAction(
      ['file-1'],
      PiiPolicy.STRICT,
    );

    expect(result.succeeded).toEqual(['file-1']);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: { piiPolicy: PiiPolicy.STRICT },
    });
  });

  /**
   * The per-row policy select renders behind `canManageOrg`, so a member
   * cannot change the policy on a file they own. A bulk path that accepted
   * the owner check the way delete and share do would be a quieter way to do
   * what the column refuses.
   */
  it('refuses a member, even one who owns the files', async () => {
    mockGetActiveMember.mockResolvedValue({ role: 'member' });

    await expect(
      bulkUpdatePiiPolicyAction(['file-1'], PiiPolicy.STRICT),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses when there is no membership at all', async () => {
    mockGetActiveMember.mockRejectedValue(new Error('no member'));

    await expect(
      bulkUpdatePiiPolicyAction(['file-1'], PiiPolicy.STRICT),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects a policy value that is not one of the enum', async () => {
    await expect(
      bulkUpdatePiiPolicyAction(['file-1'], 'DROP_EVERYTHING' as PiiPolicy),
    ).rejects.toThrow(/Invalid piiPolicy/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  /**
   * A file id from another organization finds nothing, and reports that
   * rather than being written across the tenant boundary.
   */
  it('reports a file outside the organization as not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await bulkUpdatePiiPolicyAction(
      ['other-org-file'],
      PiiPolicy.NONE,
    );

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([
      {
        fileId: 'other-org-file',
        fileName: 'other-org-file',
        error: 'not_found',
      },
    ]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps the files that did change when one update fails', async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: 'file-1', fileName: 'a.pdf' })
      .mockResolvedValueOnce({ id: 'file-2', fileName: 'b.pdf' });
    mockUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('db down'));

    const result = await bulkUpdatePiiPolicyAction(
      ['file-1', 'file-2'],
      PiiPolicy.TOXIC_ONLY,
    );

    expect(result.succeeded).toEqual(['file-1']);
    expect(result.failed).toEqual([
      { fileId: 'file-2', fileName: 'b.pdf', error: 'update_failed' },
    ]);
  });
});

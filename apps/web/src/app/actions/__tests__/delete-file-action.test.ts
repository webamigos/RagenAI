import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockFindFirst,
  mockDelete,
  mockGetOrgId,
  mockGetUser,
  mockGetMember,
  mockCount,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockDelete: vi.fn(),
  mockGetOrgId: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetMember: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: { userFile: { findFirst: mockFindFirst } },
}));
vi.mock('../../lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: mockGetOrgId,
  getOrgIdFromAuth: mockGetOrgId,
  getCurrentUser: mockGetUser,
}));
vi.mock('@/lib/auth-guards', () => ({
  getUserTeamIds: vi.fn(),
  getActiveMember: mockGetMember,
  requireOrgAdmin: vi.fn(),
}));
vi.mock('@/features/documents/services/commands/delete-file-command', () => ({
  deleteFileCommand: mockDelete,
}));
vi.mock('@/features/documents/services/queries/get-file-details-query', () => ({
  getFileDetailsByIdQuery: vi.fn(),
  getOrganizationFilesCountQuery: mockCount,
}));
vi.mock(
  '@/features/organizations/services/commands/save-organization-metadata-command',
  () => ({ saveOrganizationPublicMetadataCommand: vi.fn() }),
);
vi.mock('@/features/documents/services/queries/get-user-files-query', () => ({
  getUserFilesQuery: vi.fn(),
}));
vi.mock('@/features/documents/services/commands/reembed-file-command', () => ({
  reembedFileCommand: vi.fn(),
}));
vi.mock(
  '@/features/documents/services/commands/cancel-file-embedding-command',
  () => ({ cancelFileEmbeddingCommand: vi.fn() }),
);
vi.mock(
  '@/features/organizations/services/queries/get-account-setup-query',
  () => ({
    getAccountSetupStatusQuery: vi.fn(),
  }),
);
vi.mock(
  '@/features/organizations/services/queries/get-storage-usage-query',
  () => ({
    getProjectStorageUsageQuery: vi.fn(),
  }),
);
vi.mock('@/features/organizations/services/organization-settings', () => ({}));
vi.mock('@/features/projects/services/queries/get-project-query', () => ({
  getProjectByIdOrThrowQuery: vi.fn(),
}));
vi.mock('@/libs/ragen-api-client/client', () => ({ ragenApiRequest: vi.fn() }));
vi.mock('../../lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { deleteFileAction } from '../index';

beforeEach(() => {
  mockGetOrgId.mockReset().mockResolvedValue('org-1');
  mockGetUser.mockReset().mockResolvedValue({ id: 'user-1' });
  mockGetMember.mockReset().mockResolvedValue({ role: 'member' });
  mockFindFirst.mockReset();
  mockDelete
    .mockReset()
    .mockResolvedValue({ deleted: true, fileId: 'f1', fileName: 'a.pdf' });
  mockCount.mockReset().mockResolvedValue(3);
});

describe('deleteFileAction and who may delete', () => {
  it('lets a member delete a file they own', async () => {
    mockFindFirst.mockResolvedValue({ id: 'f1' });

    const result = await deleteFileAction('f1');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'f1', organizationId: 'org-1', ownerId: 'user-1' },
      }),
    );
    expect(mockDelete).toHaveBeenCalledWith({
      fileId: 'f1',
      organizationId: 'org-1',
    });
    expect(result.status).toBe(200);
  });

  it("refuses a member's delete of someone else's file", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await deleteFileAction('f-other');

    expect(mockDelete).not.toHaveBeenCalled();
    expect(result.status).toBe(404);
  });

  it('lets an organization admin delete any file in the organization', async () => {
    mockGetMember.mockResolvedValue({ role: 'admin' });

    await deleteFileAction('f-other');

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith({
      fileId: 'f-other',
      organizationId: 'org-1',
    });
  });
});

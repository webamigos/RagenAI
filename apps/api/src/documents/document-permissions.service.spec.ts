import type { Mock } from 'vitest';
import { DocumentPermissionsService } from './document-permissions.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type NotificationsService } from '../notifications/notifications.service.js';
import { type DocumentAccessSyncService } from './document-access-sync.service.js';

describe('DocumentPermissionsService', () => {
  function makeService(overrides: {
    member?: Partial<Record<string, Mock>>;
    team?: Partial<Record<string, Mock>>;
    userFile?: Partial<Record<string, Mock>>;
    documentFolder?: Partial<Record<string, Mock>>;
    documentPermission?: Partial<Record<string, Mock>>;
    user?: Partial<Record<string, Mock>>;
    notificationsCreate?: Mock;
    sharedByName?: string;
  }) {
    const prisma = {
      client: {
        member: { findFirst: vi.fn(), ...overrides.member },
        team: { findFirst: vi.fn(), findMany: vi.fn(), ...overrides.team },
        userFile: { findFirst: vi.fn(), ...overrides.userFile },
        documentFolder: { findFirst: vi.fn(), ...overrides.documentFolder },
        documentPermission: {
          upsert: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn(),
          delete: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.documentPermission,
        },
        user: { findMany: vi.fn(), ...overrides.user },
      },
    } as unknown as PrismaService;

    const notifications = {
      create: overrides.notificationsCreate ?? vi.fn().mockResolvedValue({}),
      memberDisplayName: vi
        .fn()
        .mockResolvedValue(
          'sharedByName' in overrides ? overrides.sharedByName : 'Ann Sharer',
        ),
    } as unknown as NotificationsService;

    const afterChange = vi.fn().mockResolvedValue(undefined);
    const accessSync = { afterChange } as unknown as DocumentAccessSyncService;

    return {
      service: new DocumentPermissionsService(
        prisma,
        notifications,
        accessSync,
      ),
      prisma,
      notifications,
      accessSync,
      afterChange,
    };
  }

  describe('shareResource', () => {
    it('rejects a user who is not an org member', async () => {
      const { service } = makeService({
        member: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.shareResource({
        resourceType: 'file',
        fileId: 'file-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(result).toEqual({
        success: false,
        error: 'User is not a member of this organization',
      });
    });

    it('rejects a team outside the organization', async () => {
      const { service } = makeService({
        team: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.shareResource({
        resourceType: 'file',
        fileId: 'file-1',
        organizationId: 'org-1',
        granteeType: 'team',
        granteeId: 'team-2',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(result).toEqual({
        success: false,
        error: 'Team not found in this organization',
      });
    });

    it('rejects a missing file', async () => {
      const { service } = makeService({
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
        userFile: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.shareResource({
        resourceType: 'file',
        fileId: 'file-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(result).toEqual({ success: false, error: 'File not found' });
    });

    it('rejects a missing folder', async () => {
      const { service } = makeService({
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
        documentFolder: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.shareResource({
        resourceType: 'folder',
        folderId: 'folder-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(result).toEqual({ success: false, error: 'Folder not found' });
    });

    it('upserts a file permission and notifies a user grantee', async () => {
      const upsert = vi.fn().mockResolvedValue({});
      const notificationsCreate = vi.fn().mockResolvedValue({});
      const { service } = makeService({
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
        userFile: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'file-1', fileName: 'doc.pdf' }),
        },
        documentPermission: { upsert },
        notificationsCreate,
      });

      const result = await service.shareResource({
        resourceType: 'file',
        fileId: 'file-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(result).toEqual({ success: true });
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            resourceType_fileId_granteeType_granteeId: {
              resourceType: 'file',
              fileId: 'file-1',
              granteeType: 'user',
              granteeId: 'user-2',
            },
          },
        }),
      );
      await Promise.resolve();
      expect(notificationsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          organizationId: 'org-1',
          type: 'DOCUMENT_SHARED',
          title: 'A document was shared with you',
          body: 'doc.pdf',
          metadata: {
            resourceName: 'doc.pdf',
            resourceKind: 'file',
            sharedByName: 'Ann Sharer',
          },
        }),
      );
    });

    it('writes folder details, without a name the sharer lookup did not find', async () => {
      const notificationsCreate = vi.fn().mockResolvedValue({});
      const { service } = makeService({
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'm-1' }) },
        documentFolder: {
          findFirst: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'HR' }),
        },
        notificationsCreate,
        sharedByName: undefined,
      });

      await service.shareResource({
        resourceType: 'folder',
        folderId: 'folder-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(notificationsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOCUMENT_SHARED',
          title: 'A folder was shared with you',
          metadata: { resourceName: 'HR', resourceKind: 'folder' },
        }),
      );
    });

    it('starts the access sync for the file or folder that was shared', async () => {
      const file = makeService({
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'm' }) },
        userFile: {
          findFirst: vi.fn().mockResolvedValue({ id: 'file-1', fileName: 'a' }),
        },
      });
      await file.service.shareResource({
        resourceType: 'file',
        fileId: 'file-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });
      expect(file.afterChange).toHaveBeenCalledWith('org-1', {
        fileIds: ['file-1'],
      });

      const folder = makeService({
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'm' }) },
        documentFolder: {
          findFirst: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'f' }),
        },
      });
      await folder.service.shareResource({
        resourceType: 'folder',
        folderId: 'folder-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });
      expect(folder.afterChange).toHaveBeenCalledWith('org-1', {
        folderIds: ['folder-1'],
      });
    });

    it('does not notify a team grantee', async () => {
      const notificationsCreate = vi.fn().mockResolvedValue({});
      const { service } = makeService({
        team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-1' }) },
        userFile: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'file-1', fileName: 'doc.pdf' }),
        },
        notificationsCreate,
      });

      await service.shareResource({
        resourceType: 'file',
        fileId: 'file-1',
        organizationId: 'org-1',
        granteeType: 'team',
        granteeId: 'team-1',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(notificationsCreate).not.toHaveBeenCalled();
    });

    it('does not throw when the notification fails', async () => {
      const notificationsCreate = vi
        .fn()
        .mockRejectedValue(new Error('notif failed'));
      const { service } = makeService({
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
        userFile: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'file-1', fileName: 'doc.pdf' }),
        },
        notificationsCreate,
      });

      const result = await service.shareResource({
        resourceType: 'file',
        fileId: 'file-1',
        organizationId: 'org-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: 'user-1',
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe('revokeShare', () => {
    it('returns failure when the permission does not exist', async () => {
      const { service } = makeService({
        documentPermission: { findUnique: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.revokeShare(1, 'org-1');
      expect(result).toEqual({ success: false, error: 'Permission not found' });
    });

    it('returns failure when the resource belongs to another org', async () => {
      const { service } = makeService({
        documentPermission: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            file: { organizationId: 'org-2' },
            folder: null,
          }),
        },
      });

      const result = await service.revokeShare(1, 'org-1');
      expect(result).toEqual({ success: false, error: 'Permission not found' });
    });

    it('deletes the permission when it belongs to the org', async () => {
      const del = vi.fn().mockResolvedValue({});
      const { service } = makeService({
        documentPermission: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            fileId: 'file-1',
            folderId: null,
            file: { organizationId: 'org-1' },
            folder: null,
          }),
          delete: del,
        },
      });

      const result = await service.revokeShare(1, 'org-1');
      expect(result).toEqual({ success: true });
      expect(del).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('starts the access sync for the file, after the row is gone', async () => {
      const del = vi.fn().mockResolvedValue({});
      const { service, afterChange } = makeService({
        documentPermission: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            fileId: 'file-1',
            folderId: null,
            file: { organizationId: 'org-1' },
            folder: null,
          }),
          delete: del,
        },
      });

      await service.revokeShare(1, 'org-1');

      expect(afterChange).toHaveBeenCalledWith('org-1', {
        fileIds: ['file-1'],
      });
      // The job reads the database, so it must not run before the delete.
      expect(afterChange.mock.invocationCallOrder[0]).toBeGreaterThan(
        del.mock.invocationCallOrder[0],
      );
    });

    it('starts it for the folder when the revoked grant was on a folder', async () => {
      const { service, afterChange } = makeService({
        documentPermission: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            fileId: null,
            folderId: 'folder-1',
            file: null,
            folder: { organizationId: 'org-1' },
          }),
        },
      });

      await service.revokeShare(1, 'org-1');

      expect(afterChange).toHaveBeenCalledWith('org-1', {
        folderIds: ['folder-1'],
      });
    });

    it('starts nothing when the revoke was refused', async () => {
      const { service, afterChange } = makeService({
        documentPermission: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            fileId: 'file-1',
            file: { organizationId: 'org-2' },
            folder: null,
          }),
        },
      });

      await service.revokeShare(1, 'org-1');

      expect(afterChange).not.toHaveBeenCalled();
    });
  });

  describe('getFilePermissions', () => {
    it('returns an empty array when the file does not belong to the org', async () => {
      const { service } = makeService({
        userFile: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.getFilePermissions('file-1', 'org-1');
      expect(result).toEqual([]);
    });

    it('resolves grantee names for users and teams', async () => {
      const { service } = makeService({
        userFile: { findFirst: vi.fn().mockResolvedValue({ id: 'file-1' }) },
        documentPermission: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              resourceType: 'file',
              granteeType: 'user',
              granteeId: 'user-1',
              permission: 'view',
            },
            {
              id: 2,
              resourceType: 'file',
              granteeType: 'team',
              granteeId: 'team-1',
              permission: 'full',
            },
          ]),
        },
        user: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
            ]),
        },
        team: {
          findFirst: vi.fn(),
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'team-1', name: 'Team A' }]),
        },
      });

      const result = await service.getFilePermissions('file-1', 'org-1');

      expect(result).toEqual([
        {
          id: '1',
          resourceType: 'file',
          granteeType: 'user',
          granteeId: 'user-1',
          granteeName: 'Alice',
          granteeEmail: 'alice@example.com',
          permission: 'view',
        },
        {
          id: '2',
          resourceType: 'file',
          granteeType: 'team',
          granteeId: 'team-1',
          granteeName: 'Team A',
          granteeEmail: undefined,
          permission: 'full',
        },
      ]);
    });
  });
});

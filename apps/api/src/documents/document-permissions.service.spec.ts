import { DocumentPermissionsService } from './document-permissions.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

describe('DocumentPermissionsService', () => {
  function makeService(overrides: {
    member?: Partial<Record<string, jest.Mock>>;
    team?: Partial<Record<string, jest.Mock>>;
    userFile?: Partial<Record<string, jest.Mock>>;
    documentFolder?: Partial<Record<string, jest.Mock>>;
    documentPermission?: Partial<Record<string, jest.Mock>>;
    user?: Partial<Record<string, jest.Mock>>;
    notificationsCreate?: jest.Mock;
  }) {
    const prisma = {
      client: {
        member: { findFirst: jest.fn(), ...overrides.member },
        team: { findFirst: jest.fn(), findMany: jest.fn(), ...overrides.team },
        userFile: { findFirst: jest.fn(), ...overrides.userFile },
        documentFolder: { findFirst: jest.fn(), ...overrides.documentFolder },
        documentPermission: {
          upsert: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn(),
          delete: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.documentPermission,
        },
        user: { findMany: jest.fn(), ...overrides.user },
      },
    } as unknown as PrismaService;

    const notifications = {
      create: overrides.notificationsCreate ?? jest.fn().mockResolvedValue({}),
    } as unknown as NotificationsService;

    return {
      service: new DocumentPermissionsService(prisma, notifications),
      prisma,
      notifications,
    };
  }

  describe('shareResource', () => {
    it('rejects a user who is not an org member', async () => {
      const { service } = makeService({
        member: { findFirst: jest.fn().mockResolvedValue(null) },
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
        team: { findFirst: jest.fn().mockResolvedValue(null) },
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
        member: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
        userFile: { findFirst: jest.fn().mockResolvedValue(null) },
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
        member: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
        documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
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
      const upsert = jest.fn().mockResolvedValue({});
      const notificationsCreate = jest.fn().mockResolvedValue({});
      const { service } = makeService({
        member: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
        userFile: {
          findFirst: jest
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
        }),
      );
    });

    it('does not notify a team grantee', async () => {
      const notificationsCreate = jest.fn().mockResolvedValue({});
      const { service } = makeService({
        team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
        userFile: {
          findFirst: jest
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
      const notificationsCreate = jest
        .fn()
        .mockRejectedValue(new Error('notif failed'));
      const { service } = makeService({
        member: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
        userFile: {
          findFirst: jest
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
        documentPermission: { findUnique: jest.fn().mockResolvedValue(null) },
      });

      const result = await service.revokeShare(1, 'org-1');
      expect(result).toEqual({ success: false, error: 'Permission not found' });
    });

    it('returns failure when the resource belongs to another org', async () => {
      const { service } = makeService({
        documentPermission: {
          findUnique: jest.fn().mockResolvedValue({
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
      const del = jest.fn().mockResolvedValue({});
      const { service } = makeService({
        documentPermission: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
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
  });

  describe('getFilePermissions', () => {
    it('returns an empty array when the file does not belong to the org', async () => {
      const { service } = makeService({
        userFile: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      const result = await service.getFilePermissions('file-1', 'org-1');
      expect(result).toEqual([]);
    });

    it('resolves grantee names for users and teams', async () => {
      const { service } = makeService({
        userFile: { findFirst: jest.fn().mockResolvedValue({ id: 'file-1' }) },
        documentPermission: {
          findMany: jest.fn().mockResolvedValue([
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
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
            ]),
        },
        team: {
          findFirst: jest.fn(),
          findMany: jest
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

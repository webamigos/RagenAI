import { FoldersService } from './folders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PiiPolicy } from '../generated/prisma/client.js';

describe('FoldersService', () => {
  function makeService(overrides: {
    team?: { findFirst?: jest.Mock };
    documentFolder?: {
      findFirst?: jest.Mock;
      findMany?: jest.Mock;
      create?: jest.Mock;
      update?: jest.Mock;
    };
    transaction?: jest.Mock;
  }) {
    const $transaction =
      overrides.transaction ??
      jest.fn((cb: (tx: unknown) => unknown) => {
        const tx = {
          documentFolder: {
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
          },
        };
        return cb(tx);
      });

    const prisma = {
      client: {
        team: {
          findFirst: overrides.team?.findFirst ?? jest.fn(),
        },
        documentFolder: {
          findFirst: overrides.documentFolder?.findFirst ?? jest.fn(),
          findMany: overrides.documentFolder?.findMany ?? jest.fn(),
          create: overrides.documentFolder?.create ?? jest.fn(),
          update: overrides.documentFolder?.update ?? jest.fn(),
        },
        $transaction,
      },
    } as unknown as PrismaService;

    return { service: new FoldersService(prisma), prisma, $transaction };
  }

  describe('createFolder', () => {
    it('rejects an empty name', async () => {
      const { service } = makeService({});
      await expect(
        service.createFolder({ name: '  ', organizationId: 'org-1' }),
      ).rejects.toThrow('Invalid folder name');
    });

    it('rejects a name over 255 chars', async () => {
      const { service } = makeService({});
      await expect(
        service.createFolder({
          name: 'a'.repeat(256),
          organizationId: 'org-1',
        }),
      ).rejects.toThrow('Invalid folder name');
    });

    it('rejects a team not in the organization', async () => {
      const { service } = makeService({
        team: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.createFolder({
          name: 'Folder',
          organizationId: 'org-1',
          teamId: 'team-1',
        }),
      ).rejects.toThrow('Team not found in this organization');
    });

    it('rejects a missing parent folder', async () => {
      const { service } = makeService({
        documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.createFolder({
          name: 'Folder',
          organizationId: 'org-1',
          parentId: 'parent-1',
        }),
      ).rejects.toThrow('Parent folder not found');
    });

    it('computes the materialized path from the parent', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'folder-2' });
      const { service } = makeService({
        documentFolder: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'parent-1', path: '/root/' }),
          create,
        },
      });

      await service.createFolder({
        name: 'Folder',
        organizationId: 'org-1',
        parentId: 'parent-1',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            path: '/root/parent-1/',
            piiPolicy: PiiPolicy.TOXIC_ONLY,
          }),
        }),
      );
    });

    it('defaults path to root when no parent given', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'folder-1' });
      const { service } = makeService({ documentFolder: { create } });

      await service.createFolder({ name: 'Folder', organizationId: 'org-1' });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ path: '/' }),
        }),
      );
    });
  });

  describe('updateFolder', () => {
    it('rejects an empty-string teamId', async () => {
      const { service } = makeService({});
      await expect(
        service.updateFolder('folder-1', 'org-1', { teamId: '' }),
      ).rejects.toThrow('Team ID cannot be an empty string');
    });

    it('rejects a team not in the organization', async () => {
      const { service } = makeService({
        team: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.updateFolder('folder-1', 'org-1', { teamId: 'team-1' }),
      ).rejects.toThrow('Team not found in this organization');
    });

    it('updates only the provided fields', async () => {
      const update = jest.fn().mockResolvedValue({});
      const { service } = makeService({ documentFolder: { update } });

      await service.updateFolder('folder-1', 'org-1', { name: 'New name' });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'folder-1', organizationId: 'org-1' },
        data: { name: 'New name' },
      });
    });
  });

  describe('moveFolder', () => {
    it('returns failure when the folder is not found', async () => {
      const { service } = makeService({
        documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const result = await service.moveFolder('folder-1', 'parent-1', 'org-1');
      expect(result).toEqual({ success: false, error: 'Folder not found' });
    });

    it('rejects moving a folder into itself', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: jest.fn().mockResolvedValue({ id: 'folder-1', path: '/' }),
        },
      });
      const result = await service.moveFolder('folder-1', 'folder-1', 'org-1');
      expect(result).toEqual({
        success: false,
        error: 'Cannot move a folder into itself',
      });
    });

    it('rejects a missing target folder', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: 'folder-1', path: '/' })
        .mockResolvedValueOnce(null);
      const { service } = makeService({ documentFolder: { findFirst } });

      const result = await service.moveFolder('folder-1', 'target-1', 'org-1');
      expect(result).toEqual({
        success: false,
        error: 'Target folder not found',
      });
    });

    it('rejects moving a folder into its own descendant', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: 'folder-1', path: '/' })
        .mockResolvedValueOnce({ id: 'child-1', path: '/folder-1/' });
      const { service } = makeService({ documentFolder: { findFirst } });

      const result = await service.moveFolder('folder-1', 'child-1', 'org-1');
      expect(result).toEqual({
        success: false,
        error: 'Cannot move a folder into its own subfolder',
      });
    });

    it('moves the folder and rewrites descendant paths in a transaction', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: 'folder-1', path: '/' })
        .mockResolvedValueOnce({ id: 'target-1', path: '/' });

      const txUpdate = jest.fn().mockResolvedValue({});
      const txFindMany = jest
        .fn()
        .mockResolvedValue([{ id: 'child-1', path: '/folder-1/child-1/' }]);

      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => {
        const tx = {
          documentFolder: { update: txUpdate, findMany: txFindMany },
        };
        return cb(tx);
      });

      const { service } = makeService({
        documentFolder: { findFirst },
        transaction: $transaction,
      });

      const result = await service.moveFolder('folder-1', 'target-1', 'org-1');

      expect(result).toEqual({ success: true });
      expect(txUpdate).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { parentId: 'target-1', path: '/target-1/' },
      });
      expect(txUpdate).toHaveBeenCalledWith({
        where: { id: 'child-1' },
        data: { path: '/target-1/folder-1/child-1/' },
      });
    });

    it('returns failure when the transaction throws', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: 'folder-1', path: '/' });
      const $transaction = jest.fn().mockRejectedValue(new Error('db error'));

      const { service } = makeService({
        documentFolder: { findFirst },
        transaction: $transaction,
      });

      const result = await service.moveFolder('folder-1', null, 'org-1');
      expect(result).toEqual({
        success: false,
        error: 'Failed to move folder',
      });
    });
  });

  describe('getFolders', () => {
    it('scopes to organization only for org admins', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = makeService({ documentFolder: { findMany } });

      await service.getFolders('org-1', [], 'user-1', true);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('maps folders into DocumentFolderItem shape', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'folder-1',
          name: 'Folder',
          teamId: 'team-1',
          team: { name: 'Team A' },
          parentId: null,
          path: '/',
          ownerId: 'user-1',
          owner: { name: 'Alice' },
          _count: { files: 3 },
          piiPolicy: PiiPolicy.TOXIC_ONLY,
        },
      ]);
      const { service } = makeService({ documentFolder: { findMany } });

      const result = await service.getFolders('org-1', [], 'user-1', false);

      expect(result).toEqual([
        {
          id: 'folder-1',
          name: 'Folder',
          teamId: 'team-1',
          teamName: 'Team A',
          parentId: null,
          path: '/',
          ownerId: 'user-1',
          ownerName: 'Alice',
          fileCount: 3,
          piiPolicy: PiiPolicy.TOXIC_ONLY,
        },
      ]);
    });
  });

  describe('getFolderBreadcrumbs', () => {
    it('returns an empty array when the folder is not found', async () => {
      const { service } = makeService({
        documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const result = await service.getFolderBreadcrumbs('folder-1', 'org-1');
      expect(result).toEqual([]);
    });

    it('returns just the folder when it is a root folder', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'folder-1', name: 'Root', path: '/' }),
        },
      });
      const result = await service.getFolderBreadcrumbs('folder-1', 'org-1');
      expect(result).toEqual([{ id: 'folder-1', name: 'Root' }]);
    });

    it('builds the ancestor chain in path order', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'folder-3',
        name: 'Grandchild',
        path: '/folder-1/folder-2/',
      });
      const findMany = jest.fn().mockResolvedValue([
        { id: 'folder-2', name: 'Child' },
        { id: 'folder-1', name: 'Root' },
      ]);
      const { service } = makeService({
        documentFolder: { findFirst, findMany },
      });

      const result = await service.getFolderBreadcrumbs('folder-3', 'org-1');

      expect(result).toEqual([
        { id: 'folder-1', name: 'Root' },
        { id: 'folder-2', name: 'Child' },
        { id: 'folder-3', name: 'Grandchild' },
      ]);
    });
  });

  describe('getFolderPiiPolicy / updateFolderPiiPolicy', () => {
    it('defaults to TOXIC_ONLY when the folder is missing', async () => {
      const { service } = makeService({
        documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const result = await service.getFolderPiiPolicy('folder-1', 'org-1');
      expect(result).toBe(PiiPolicy.TOXIC_ONLY);
    });

    it('returns the stored policy', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ piiPolicy: PiiPolicy.STRICT }),
        },
      });
      const result = await service.getFolderPiiPolicy('folder-1', 'org-1');
      expect(result).toBe(PiiPolicy.STRICT);
    });

    it('rejects an invalid piiPolicy value', async () => {
      const { service } = makeService({});
      await expect(
        service.updateFolderPiiPolicy(
          'folder-1',
          'org-1',
          'NOT_A_POLICY' as PiiPolicy,
        ),
      ).rejects.toThrow('Invalid piiPolicy value');
    });

    it('updates a valid piiPolicy value', async () => {
      const update = jest.fn().mockResolvedValue({});
      const { service } = makeService({ documentFolder: { update } });

      await service.updateFolderPiiPolicy(
        'folder-1',
        'org-1',
        PiiPolicy.STRICT,
      );

      expect(update).toHaveBeenCalledWith({
        where: { id: 'folder-1', organizationId: 'org-1' },
        data: { piiPolicy: PiiPolicy.STRICT },
      });
    });
  });
});

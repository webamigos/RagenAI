const mockSetPayload = jest.fn();

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    setPayload: mockSetPayload,
  })),
}));

import { VectorPermissionsService } from './vector-permissions.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('VectorPermissionsService', () => {
  function makeService(overrides: {
    userFile?: Partial<Record<string, jest.Mock>>;
    documentPermission?: Partial<Record<string, jest.Mock>>;
    documentFolder?: Partial<Record<string, jest.Mock>>;
    organization?: Partial<Record<string, jest.Mock>>;
  }) {
    const prisma = {
      client: {
        userFile: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          ...overrides.userFile,
        },
        documentPermission: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.documentPermission,
        },
        documentFolder: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.documentFolder,
        },
        organization: { findUnique: jest.fn(), ...overrides.organization },
      },
    } as unknown as PrismaService;

    return { service: new VectorPermissionsService(prisma), prisma };
  }

  beforeEach(() => {
    mockSetPayload.mockReset().mockResolvedValue({});
  });

  describe('computeAccessibleBy', () => {
    it('falls back to org-wide access when the file does not exist', async () => {
      const { service } = makeService({
        userFile: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      const result = await service.computeAccessibleBy('missing-file', 'org-1');
      expect(result).toEqual(['org:org-1']);
    });

    it('treats a legacy file with no owner as org-wide accessible', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: null,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(['org:org-1']);
    });

    it('always includes the owner as a principal', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(['user:user-1']);
    });

    it('includes the folder team when the folder has one', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: 'folder-1',
            folder: {
              id: 'folder-1',
              teamId: 'team-1',
              path: '/',
              ownerId: null,
            },
            permissions: [],
          }),
        },
        documentPermission: { findMany: jest.fn().mockResolvedValue([]) },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(
        expect.arrayContaining(['user:user-1', 'team:team-1']),
      );
      expect(result).toHaveLength(2);
    });

    it('includes principals from direct file permissions', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: null,
            folder: null,
            permissions: [
              { granteeType: 'user', granteeId: 'user-2' },
              { granteeType: 'team', granteeId: 'team-2' },
            ],
          }),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(
        expect.arrayContaining(['user:user-1', 'user:user-2', 'team:team-2']),
      );
    });

    it('includes principals from the folder-level permissions', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: 'folder-1',
            folder: { id: 'folder-1', teamId: null, path: '/', ownerId: null },
            permissions: [],
          }),
        },
        documentPermission: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ granteeType: 'user', granteeId: 'user-3' }]),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(
        expect.arrayContaining(['user:user-1', 'user:user-3']),
      );
    });

    it('includes principals from ancestor folder permissions via the materialized path', async () => {
      const findMany = jest
        .fn()
        .mockResolvedValueOnce([]) // folder-level permissions for folder-2
        .mockResolvedValueOnce([
          { granteeType: 'team', granteeId: 'team-ancestor' },
        ]); // ancestor permissions

      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: 'folder-2',
            folder: {
              id: 'folder-2',
              teamId: null,
              path: '/folder-1/',
              ownerId: null,
            },
            permissions: [],
          }),
        },
        documentPermission: { findMany },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');

      expect(result).toEqual(
        expect.arrayContaining(['user:user-1', 'team:team-ancestor']),
      );
      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: { resourceType: 'folder', folderId: 'folder-2' },
        select: { granteeType: true, granteeId: true },
      });
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { resourceType: 'folder', folderId: { in: ['folder-1'] } },
        select: { granteeType: true, granteeId: true },
      });
    });

    it('does not query ancestor permissions when the folder is at the root', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: 'folder-1',
            folder: { id: 'folder-1', teamId: null, path: '/', ownerId: null },
            permissions: [],
          }),
        },
        documentPermission: { findMany },
      });

      await service.computeAccessibleBy('file-1', 'org-1');

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('deduplicates principals across ownership, team, and permission sources', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: 'folder-1',
            folder: {
              id: 'folder-1',
              teamId: 'team-1',
              path: '/',
              ownerId: null,
            },
            permissions: [{ granteeType: 'team', granteeId: 'team-1' }],
          }),
        },
        documentPermission: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ granteeType: 'team', granteeId: 'team-1' }]),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(
        expect.arrayContaining(['user:user-1', 'team:team-1']),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('syncFolderVectorPermissions', () => {
    it('no-ops when the folder is not found', async () => {
      const { service, prisma } = makeService({
        documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await service.syncFolderVectorPermissions('folder-1', 'org-1');

      expect(prisma.client.organization.findUnique).not.toHaveBeenCalled();
    });

    it('updates accessible_by in Qdrant for every file in the folder and its descendants', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: jest.fn().mockResolvedValue({ path: '/' }),
          findMany: jest.fn().mockResolvedValue([{ id: 'folder-2' }]),
        },
        userFile: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }]),
          findFirst: jest.fn().mockResolvedValue({
            ownerId: null,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
        organization: {
          findUnique: jest.fn().mockResolvedValue({ vectorStore: 'qdrant' }),
        },
      });

      await service.syncFolderVectorPermissions('folder-1', 'org-1');

      expect(mockSetPayload).toHaveBeenCalledTimes(2);
      expect(mockSetPayload).toHaveBeenCalledWith('org-1', {
        payload: { 'metadata.accessible_by': ['org:org-1'] },
        filter: {
          must: [{ key: 'metadata.file_id', match: { value: 'file-1' } }],
        },
        wait: true,
      });
    });

    it('skips the Qdrant call for non-qdrant vector stores', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: jest.fn().mockResolvedValue({ path: '/' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        userFile: {
          findMany: jest.fn().mockResolvedValue([{ id: 'file-1' }]),
          findFirst: jest.fn().mockResolvedValue({
            ownerId: null,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
        organization: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ vectorStore: 'meilisearch' }),
        },
      });

      await service.syncFolderVectorPermissions('folder-1', 'org-1');

      expect(mockSetPayload).not.toHaveBeenCalled();
    });

    it('defaults to Qdrant when the org has no vectorStore set', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: jest.fn().mockResolvedValue({ path: '/' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        userFile: {
          findMany: jest.fn().mockResolvedValue([{ id: 'file-1' }]),
          findFirst: jest.fn().mockResolvedValue({
            ownerId: null,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
        organization: {
          findUnique: jest.fn().mockResolvedValue({ vectorStore: null }),
        },
      });

      await service.syncFolderVectorPermissions('folder-1', 'org-1');

      expect(mockSetPayload).toHaveBeenCalledTimes(1);
    });
  });
});

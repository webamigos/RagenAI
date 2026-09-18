const mockSetPayload = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn(function () {
    return {
      setPayload: mockSetPayload,
    };
  }),
}));

import type { Mock } from 'vitest';
import { VectorPermissionsService } from './vector-permissions.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('VectorPermissionsService', () => {
  function makeService(overrides: {
    userFile?: Partial<Record<string, Mock>>;
    documentPermission?: Partial<Record<string, Mock>>;
    documentFolder?: Partial<Record<string, Mock>>;
    organization?: Partial<Record<string, Mock>>;
  }) {
    const prisma = {
      client: {
        userFile: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
          ...overrides.userFile,
        },
        documentPermission: {
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.documentPermission,
        },
        documentFolder: {
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.documentFolder,
        },
        organization: { findUnique: vi.fn(), ...overrides.organization },
      },
    } as unknown as PrismaService;

    return { service: new VectorPermissionsService(prisma), prisma };
  }

  beforeEach(() => {
    mockSetPayload.mockReset().mockResolvedValue({});
  });

  describe('computeAccessibleBy', () => {
    // Was `['org:org-1']`. A lookup that finds nothing is not evidence that
    // everyone may read it: this is an access boundary, so a miss fails
    // closed. A chunk nobody can reach is recoverable; one everybody can
    // reach is a leak.
    it('grants nobody when the file does not exist', async () => {
      const { service } = makeService({
        userFile: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.computeAccessibleBy('missing-file', 'org-1');
      expect(result).toEqual([]);
    });

    // Org-wide is the flag now, not a null owner. The `is_org_wide` migration
    // backfilled `true` onto every then-ownerless row, so a legacy file
    // carries the flag and still reads as org-wide.
    it('treats a legacy file carrying the org-wide flag as org-wide accessible', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: vi.fn().mockResolvedValue({
            ownerId: null,
            isOrgWide: true,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(['org:org-1']);
    });

    // The other half, and the reason the flag exists: the owner FK is
    // ON DELETE SET NULL, so deleting a user used to republish every private
    // file they owned to the whole organization.
    it('does not publish a file whose owner was deleted', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: vi.fn().mockResolvedValue({
            ownerId: null,
            isOrgWide: false,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual([]);
    });

    it('always includes the owner as a principal', async () => {
      const { service } = makeService({
        userFile: {
          findFirst: vi.fn().mockResolvedValue({
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
          findFirst: vi.fn().mockResolvedValue({
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
        documentPermission: { findMany: vi.fn().mockResolvedValue([]) },
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
          findFirst: vi.fn().mockResolvedValue({
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
          findFirst: vi.fn().mockResolvedValue({
            ownerId: 'user-1',
            folderId: 'folder-1',
            folder: { id: 'folder-1', teamId: null, path: '/', ownerId: null },
            permissions: [],
          }),
        },
        documentPermission: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ granteeType: 'user', granteeId: 'user-3' }]),
        },
      });

      const result = await service.computeAccessibleBy('file-1', 'org-1');
      expect(result).toEqual(
        expect.arrayContaining(['user:user-1', 'user:user-3']),
      );
    });

    // The folder and its ancestors are read in one query rather than two —
    // same principals, one round trip on a path that runs per file.
    it('includes principals from ancestor folder permissions via the materialized path', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([
          { granteeType: 'team', granteeId: 'team-ancestor' },
        ]);

      const { service } = makeService({
        userFile: {
          findFirst: vi.fn().mockResolvedValue({
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
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          resourceType: 'folder',
          folderId: { in: ['folder-2', 'folder-1'] },
        },
        select: { granteeType: true, granteeId: true },
      });
    });

    it('does not query ancestor permissions when the folder is at the root', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const { service } = makeService({
        userFile: {
          findFirst: vi.fn().mockResolvedValue({
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
          findFirst: vi.fn().mockResolvedValue({
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
          findMany: vi
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
        documentFolder: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      await service.syncFolderVectorPermissions('folder-1', 'org-1');

      expect(prisma.client.organization.findUnique).not.toHaveBeenCalled();
    });

    it('updates accessible_by in Qdrant for every file in the folder and its descendants', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: vi.fn().mockResolvedValue({ path: '/' }),
          findMany: vi.fn().mockResolvedValue([{ id: 'folder-2' }]),
        },
        userFile: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }]),
          findFirst: vi.fn().mockResolvedValue({
            ownerId: null,
            isOrgWide: true,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
        organization: {
          findUnique: vi.fn().mockResolvedValue({ vectorStore: 'qdrant' }),
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
          findFirst: vi.fn().mockResolvedValue({ path: '/' }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        userFile: {
          findMany: vi.fn().mockResolvedValue([{ id: 'file-1' }]),
          findFirst: vi.fn().mockResolvedValue({
            ownerId: null,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
        organization: {
          findUnique: vi.fn().mockResolvedValue({ vectorStore: 'meilisearch' }),
        },
      });

      await service.syncFolderVectorPermissions('folder-1', 'org-1');

      expect(mockSetPayload).not.toHaveBeenCalled();
    });

    it('defaults to Qdrant when the org has no vectorStore set', async () => {
      const { service } = makeService({
        documentFolder: {
          findFirst: vi.fn().mockResolvedValue({ path: '/' }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        userFile: {
          findMany: vi.fn().mockResolvedValue([{ id: 'file-1' }]),
          findFirst: vi.fn().mockResolvedValue({
            ownerId: null,
            folderId: null,
            folder: null,
            permissions: [],
          }),
        },
        organization: {
          findUnique: vi.fn().mockResolvedValue({ vectorStore: null }),
        },
      });

      await service.syncFolderVectorPermissions('folder-1', 'org-1');

      expect(mockSetPayload).toHaveBeenCalledTimes(1);
    });
  });
});

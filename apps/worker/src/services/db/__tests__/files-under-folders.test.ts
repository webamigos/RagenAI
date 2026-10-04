/* eslint-disable no-var */
var mockFolderFindMany: Mock;
var mockFileFindMany: Mock;
/* eslint-enable no-var */

vi.mock('../prisma.js', () => {
  mockFolderFindMany = vi.fn();
  mockFileFindMany = vi.fn();
  return {
    getPrisma: () => ({
      documentFolder: { findMany: mockFolderFindMany },
      userFile: { findMany: mockFileFindMany },
    }),
  };
});

import type { Mock } from 'vitest';
import { db } from '../db.js';

beforeEach(() => {
  mockFolderFindMany.mockReset();
  mockFileFindMany.mockReset();
});

// What an access sync resolves a folder to (#1245). A folder share, move or
// team change reaches every file beneath it, so a miss here is a revoked grant
// that still retrieves — and an unscoped lookup is another tenant's files.
describe('getFileIdsUnderFolders', () => {
  it('returns the files in the folder and in every descendant', async () => {
    mockFolderFindMany
      .mockResolvedValueOnce([{ id: 'a', path: '/' }])
      .mockResolvedValueOnce([{ id: 'b' }, { id: 'c' }]);
    mockFileFindMany.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }]);

    const ids = await db.getFileIdsUnderFolders('org-1', ['a']);

    expect(ids).toEqual(['f1', 'f2']);
    expect(mockFileFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', folderId: { in: ['a', 'b', 'c'] } },
      select: { id: true },
    });
  });

  it('finds descendants by the materialized path, as the web app does', async () => {
    mockFolderFindMany
      .mockResolvedValueOnce([
        { id: 'a', path: '/' },
        { id: 'x', path: '/p/' },
      ])
      .mockResolvedValueOnce([]);
    mockFileFindMany.mockResolvedValue([]);

    await db.getFileIdsUnderFolders('org-1', ['a', 'x']);

    expect(mockFolderFindMany.mock.calls[1][0].where).toEqual({
      organizationId: 'org-1',
      OR: [{ path: { startsWith: '/a/' } }, { path: { startsWith: '/p/x/' } }],
    });
  });

  it('scopes the folder lookup to the organization, whatever ids it is given', async () => {
    mockFolderFindMany.mockResolvedValueOnce([]);

    expect(await db.getFileIdsUnderFolders('org-1', ['someone-elses'])).toEqual(
      [],
    );

    expect(mockFolderFindMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      id: { in: ['someone-elses'] },
    });
    // A folder that is not in this organization ends the resolution there.
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it('does nothing for an empty list', async () => {
    expect(await db.getFileIdsUnderFolders('org-1', [])).toEqual([]);
    expect(mockFolderFindMany).not.toHaveBeenCalled();
  });
});

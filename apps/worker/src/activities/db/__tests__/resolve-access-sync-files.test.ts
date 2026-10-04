import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/db/index.js', () => ({
  db: { getFileIdsUnderFolders: vi.fn() },
}));

const { db } = await import('../../../services/db/index.js');
const { resolveAccessSyncFiles } =
  await import('../resolve-access-sync-files.js');

const underFolders = db.getFileIdsUnderFolders as unknown as ReturnType<
  typeof vi.fn
>;

describe('resolveAccessSyncFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds the files under the folders to the files it was named, once each', async () => {
    underFolders.mockResolvedValue(['f2', 'f3', 'f1']);

    const files = await resolveAccessSyncFiles({
      orgId: 'org-1',
      fileIds: ['f1'],
      folderIds: ['folder-1'],
    });

    expect(underFolders).toHaveBeenCalledWith('org-1', ['folder-1']);
    expect(files.sort()).toEqual(['f1', 'f2', 'f3']);
  });

  it('works from files alone', async () => {
    underFolders.mockResolvedValue([]);

    expect(
      await resolveAccessSyncFiles({ orgId: 'org-1', fileIds: ['f1'] }),
    ).toEqual(['f1']);
  });
});

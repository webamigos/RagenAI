import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/db/index.js', () => ({
  db: { getFileAccessRows: vi.fn() },
}));
vi.mock('../../../services/qdrant.js', () => ({
  qdrantService: { setFileAccess: vi.fn() },
}));

const { db } = await import('../../../services/db/index.js');
const { qdrantService } = await import('../../../services/qdrant.js');
const { syncFileAccess } = await import('../sync-file-access.js');

const getRows = db.getFileAccessRows as unknown as ReturnType<typeof vi.fn>;
const setFileAccess = qdrantService.setFileAccess as unknown as ReturnType<
  typeof vi.fn
>;

const rows = (overrides: Record<string, unknown> = {}) => ({
  ownerId: 'user-1',
  isOrgWide: false,
  folderTeamId: null,
  grants: [],
  ...overrides,
});

describe('syncFileAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the principals as the file stands now', async () => {
    getRows.mockResolvedValue(
      rows({ grants: [{ granteeType: 'user', granteeId: 'user-2' }] }),
    );

    const outcome = await syncFileAccess({ orgId: 'org-1', fileId: 'file-1' });

    expect(outcome).toBe('synced');
    expect(setFileAccess).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: 'file-1',
      accessibleBy: ['user:user-1', 'user:user-2'],
    });
  });

  it('removes a revoked principal — the case this exists for', async () => {
    // The grant was deleted after the file was indexed; only the owner is left.
    getRows.mockResolvedValue(rows());

    await syncFileAccess({ orgId: 'org-1', fileId: 'file-1' });

    expect(setFileAccess.mock.calls[0][0].accessibleBy).toEqual([
      'user:user-1',
    ]);
  });

  it('writes an empty list rather than skipping when nobody may read the file', async () => {
    getRows.mockResolvedValue(rows({ ownerId: null }));

    await syncFileAccess({ orgId: 'org-1', fileId: 'file-1' });

    expect(setFileAccess.mock.calls[0][0].accessibleBy).toEqual([]);
  });

  it('writes nothing for a file that is gone from the organization', async () => {
    getRows.mockResolvedValue(null);

    const outcome = await syncFileAccess({ orgId: 'org-1', fileId: 'file-1' });

    expect(outcome).toBe('missing');
    expect(setFileAccess).not.toHaveBeenCalled();
  });

  describe('after an ingest, with what it wrote', () => {
    it('leaves the points alone when nothing changed while it ran', async () => {
      getRows.mockResolvedValue(rows());

      const outcome = await syncFileAccess({
        orgId: 'org-1',
        fileId: 'file-1',
        unlessEqualTo: ['user:user-1'],
      });

      expect(outcome).toBe('unchanged');
      expect(setFileAccess).not.toHaveBeenCalled();
    });

    it('does not mind the order the principals come in', async () => {
      getRows.mockResolvedValue(
        rows({ grants: [{ granteeType: 'team', granteeId: 't1' }] }),
      );

      const outcome = await syncFileAccess({
        orgId: 'org-1',
        fileId: 'file-1',
        unlessEqualTo: ['team:t1', 'user:user-1'],
      });

      expect(outcome).toBe('unchanged');
    });

    it('overwrites a stale snapshot — a share revoked while the file was being embedded', async () => {
      // The ingest took ['user:user-1', 'user:user-2'] before it started
      // writing; the grant to user-2 was revoked during the write.
      getRows.mockResolvedValue(rows());

      const outcome = await syncFileAccess({
        orgId: 'org-1',
        fileId: 'file-1',
        unlessEqualTo: ['user:user-1', 'user:user-2'],
      });

      expect(outcome).toBe('synced');
      expect(setFileAccess.mock.calls[0][0].accessibleBy).toEqual([
        'user:user-1',
      ]);
    });
  });
});

import { computeFileAccessPrincipals } from '../compute-file-access-principals.js';

vi.mock('../../../services/db/index.js', () => ({
  db: { getFileAccessRows: vi.fn() },
}));

const { db } = await import('../../../services/db/index.js');
const getRows = db.getFileAccessRows as unknown as ReturnType<typeof vi.fn>;

describe('computeFileAccessPrincipals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This activity is five lines of wiring, and wiring is where the field went
  // missing in the first place: the worker indexed `metadata.accessible_by`
  // and nothing filled it. Assert what it wires.
  it('passes the row values through to the shared rule', async () => {
    getRows.mockResolvedValue({
      ownerId: 'user-1',
      isOrgWide: true,
      folderTeamId: 'team-2',
      grants: [{ granteeType: 'user', granteeId: 'user-3' }],
    });

    const principals = await computeFileAccessPrincipals('file-1', 'org-1');

    expect(getRows).toHaveBeenCalledWith('file-1', 'org-1');
    expect(principals).toEqual([
      'org:org-1',
      'user:user-1',
      'team:team-2',
      'user:user-3',
    ]);
  });

  // Fail closed. A chunk nobody may reach is recoverable; one everybody may
  // reach is a leak, and a file that vanished mid-ingest is exactly when a
  // permissive default would be written.
  it('grants nobody when the file is gone', async () => {
    getRows.mockResolvedValue(null);

    await expect(
      computeFileAccessPrincipals('file-1', 'org-1'),
    ).resolves.toEqual([]);
  });
});

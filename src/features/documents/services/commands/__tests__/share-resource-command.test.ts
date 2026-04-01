import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    member: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    team: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    userFile: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    documentFolder: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    documentPermission: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

import { shareResourceCommand } from '../share-resource-command';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const GRANTER_ID = 'granter-1';

describe('shareResourceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when grantee user is not an org member', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await shareResourceCommand({
      resourceType: 'file',
      filePublicId: 'file-pub-1',
      organizationId: ORG_ID,
      granteeType: 'user',
      granteeId: USER_ID,
      permission: 'view',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'User is not a member of this organization',
    });
  });

  it('returns error when grantee team not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await shareResourceCommand({
      resourceType: 'file',
      filePublicId: 'file-pub-1',
      organizationId: ORG_ID,
      granteeType: 'team',
      granteeId: 'team-1',
      permission: 'full',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'Team not found in this organization',
    });
  });

  it('returns error when file not found', async () => {
    // First call: member check passes
    mockFindFirst.mockResolvedValueOnce({ id: 'member-1' });
    // Second call: file not found
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await shareResourceCommand({
      resourceType: 'file',
      filePublicId: 'nonexistent',
      organizationId: ORG_ID,
      granteeType: 'user',
      granteeId: USER_ID,
      permission: 'view',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'File not found',
    });
  });

  it('returns error when folder not found', async () => {
    // First call: team check passes
    mockFindFirst.mockResolvedValueOnce({ id: 'team-1' });
    // Second call: folder not found
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await shareResourceCommand({
      resourceType: 'folder',
      folderId: 999,
      organizationId: ORG_ID,
      granteeType: 'team',
      granteeId: 'team-1',
      permission: 'view',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'Folder not found',
    });
  });

  it('creates file permission successfully', async () => {
    // member check
    mockFindFirst.mockResolvedValueOnce({ id: 'member-1' });
    // file check
    mockFindFirst.mockResolvedValueOnce({
      id: 'file-1',
      publicId: 'file-pub-1',
    });
    mockUpsert.mockResolvedValue({ id: 1 });

    const result = await shareResourceCommand({
      resourceType: 'file',
      filePublicId: 'file-pub-1',
      organizationId: ORG_ID,
      granteeType: 'user',
      granteeId: USER_ID,
      permission: 'full',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          resourceType: 'file',
          filePublicId: 'file-pub-1',
          granteeType: 'user',
          granteeId: USER_ID,
          permission: 'full',
        }),
        update: { permission: 'full' },
      }),
    );
  });
});

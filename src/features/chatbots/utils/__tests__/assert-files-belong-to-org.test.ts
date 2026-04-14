import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCount = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: { userFile: { count: (...args: unknown[]) => mockCount(...args) } },
}));

import { assertFilesBelongToOrg } from '../assert-files-belong-to-org';

describe('assertFilesBelongToOrg', () => {
  beforeEach(() => {
    mockCount.mockReset();
  });

  it('is a no-op when fileIds is empty', async () => {
    await expect(assertFilesBelongToOrg([], 'org-1')).resolves.toBeUndefined();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it('passes when every file belongs to the org', async () => {
    mockCount.mockResolvedValue(2);
    await expect(
      assertFilesBelongToOrg(['f-1', 'f-2'], 'org-1'),
    ).resolves.toBeUndefined();
    expect(mockCount).toHaveBeenCalledWith({
      where: { id: { in: ['f-1', 'f-2'] }, organizationId: 'org-1' },
    });
  });

  it('throws when some files are missing or belong to another org', async () => {
    mockCount.mockResolvedValue(1);
    await expect(
      assertFilesBelongToOrg(['f-1', 'f-2'], 'org-1'),
    ).rejects.toThrow(
      /do not belong to this organization.*expected 2, found 1/,
    );
  });

  it('deduplicates fileIds before counting so duplicates are not treated as missing', async () => {
    mockCount.mockResolvedValue(2);
    await expect(
      assertFilesBelongToOrg(['f-1', 'f-1', 'f-2'], 'org-1'),
    ).resolves.toBeUndefined();

    const callArg = mockCount.mock.calls[0][0];
    expect(callArg.where.id.in).toHaveLength(2);
    expect(callArg.where.id.in).toEqual(expect.arrayContaining(['f-1', 'f-2']));
  });

  it('throws when zero files are found for a non-empty list', async () => {
    mockCount.mockResolvedValue(0);
    await expect(
      assertFilesBelongToOrg(['phantom-1'], 'org-1'),
    ).rejects.toThrow(/expected 1, found 0/);
  });
});

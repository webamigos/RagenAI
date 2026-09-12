import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUserFilesQuery = vi.hoisted(() => vi.fn());
const mockGetFileScopeCountsQuery = vi.hoisted(() => vi.fn());

vi.mock('@/features/documents/services/queries/get-user-files-query', () => ({
  getUserFilesQuery: (...args: unknown[]) => mockGetUserFilesQuery(...args),
}));

vi.mock(
  '@/features/documents/services/queries/get-file-scope-counts-query',
  () => ({
    getFileScopeCountsQuery: (...args: unknown[]) =>
      mockGetFileScopeCountsQuery(...args),
  }),
);

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: vi.fn(async () => 'org-1'),
  getCurrentUser: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('@/lib/auth-guards', () => ({
  getUserTeamIds: vi.fn(async () => []),
  getActiveMember: vi.fn(async () => ({ role: 'owner' })),
}));

vi.mock('@/lib/auth-access-control', () => ({
  orgVisibilityScope: () => 'organization',
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('../DocumentsListContent', () => ({
  DocumentsListContent: () => null,
}));

import UploadedListPage from '../page';

const emptyResult = {
  items: [],
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 1,
};

function render(searchParams: Record<string, string | string[] | undefined>) {
  return UploadedListPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
}

function folderArg(): unknown {
  const [, , options] = mockGetUserFilesQuery.mock.calls[0] as [
    string,
    string[],
    { folderId?: string | null },
  ];
  return options.folderId;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserFilesQuery.mockResolvedValue(emptyResult);
  mockGetFileScopeCountsQuery.mockResolvedValue({
    all: { files: 0, pages: 0 },
    'my-files': { files: 0, pages: 0 },
    'shared-with-me': { files: 0, pages: 0 },
  });
});

describe('the knowledge base list, and what a folder narrows', () => {
  /**
   * `null` is not "no folder selected" — it is "the files that sit in no
   * folder at all", and Prisma tells the two apart. With `null` here, All
   * files listed only what nobody had filed while the rail beside it counted
   * everything, and the table offers no way to open a folder from a row.
   */
  it('applies no folder condition when no folder is selected', async () => {
    await render({});

    expect(folderArg()).toBeUndefined();
  });

  it('narrows to the folder when one is selected', async () => {
    await render({ folderId: 'folder-7' });

    expect(folderArg()).toBe('folder-7');
  });

  /**
   * The rail's counts describe the scope you would switch *to*, so they take
   * no folder either way — the list and the counts disagreeing about what a
   * folder means is the bug this pair of tests is here to hold shut.
   */
  it('never passes a folder to the scope counts', async () => {
    await render({ folderId: 'folder-7' });

    const [, , options] = mockGetFileScopeCountsQuery.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(options).not.toHaveProperty('folderId');
  });
});

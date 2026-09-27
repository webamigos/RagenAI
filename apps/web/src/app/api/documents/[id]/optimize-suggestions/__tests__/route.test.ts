import { beforeEach, describe, expect, it, vi } from 'vitest';

const jobStart = vi.hoisted(() => vi.fn());
const fileFindFirst = vi.hoisted(() => vi.fn());
const docFindFirst = vi.hoisted(() => vi.fn());
const executeRaw = vi.hoisted(() => vi.fn());
const versionFindFirst = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: vi.fn(async () => 'org-1'),
  getCurrentUserId: vi.fn(async () => 'user-1'),
}));
vi.mock('@/features/documents/services/queries/get-document-actor', () => ({
  getDocumentActor: vi.fn(async () => ({
    userId: 'user-1',
    teamIds: [],
    scope: 'member',
  })),
  canAccessDocument: vi.fn(async () => true),
}));
vi.mock('@/libs/jobs', () => ({ jobs: () => ({ start: jobStart }) }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: { findFirst: fileFindFirst },
    userDocument: { findFirst: docFindFirst },
    documentVersion: { findFirst: versionFindFirst },
    $executeRaw: executeRaw,
  },
}));

import { POST } from '../route';

const call = () =>
  POST({} as never, { params: Promise.resolve({ id: 'doc-1' }) });

describe('POST /api/documents/[id]/optimize-suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionFindFirst.mockResolvedValue(null);
    executeRaw.mockResolvedValue(1);
  });

  it('starts the job for a document with text', async () => {
    fileFindFirst.mockResolvedValue({
      id: 'file-1',
      fileType: 'MARKDOWN',
      fileExtension: 'md',
      document: {
        id: 'doc-1',
        content: 'Regulamin.',
        title: 'R',
        projectId: null,
      },
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect(jobStart).toHaveBeenCalledTimes(1);
  });

  // It used to read the raw stored file here, unparsed and unmasked, and
  // start a job on a document with no text (spec B7).
  it('refuses a document with no text instead of reading the raw file', async () => {
    fileFindFirst.mockResolvedValue({
      id: 'file-1',
      fileType: 'MARKDOWN',
      fileExtension: 'md',
      document: { id: 'doc-1', content: '', title: 'R', projectId: null },
    });
    docFindFirst.mockResolvedValue({
      id: 'doc-1',
      content: '',
      title: 'R',
      projectId: null,
    });

    const res = await call();

    expect(res.status).toBe(422);
    expect(jobStart).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('refuses a document whose text is only whitespace', async () => {
    const blank = {
      id: 'doc-1',
      content: ' \n\t\n ',
      title: 'R',
      projectId: null,
    };
    fileFindFirst.mockResolvedValue({
      id: 'file-1',
      fileType: 'MARKDOWN',
      fileExtension: 'md',
      document: blank,
    });
    docFindFirst.mockResolvedValue(blank);

    const res = await call();

    expect(res.status).toBe(422);
    expect(jobStart).not.toHaveBeenCalled();
  });

  // Q4, D2: Optimize suggests prose edits; a spreadsheet is re-parsed instead.
  it.each(['XLSX', 'CSV', 'IMAGE'])(
    'refuses a %s file with text, and starts nothing',
    async (fileType) => {
      fileFindFirst.mockResolvedValue({
        id: 'file-1',
        fileType,
        fileExtension: fileType.toLowerCase(),
        document: {
          id: 'doc-1',
          content: 'a,b\n1,2',
          title: 'R',
          projectId: null,
        },
      });

      const res = await call();

      expect(res.status).toBe(422);
      expect(jobStart).not.toHaveBeenCalled();
      expect(executeRaw).not.toHaveBeenCalled();
    },
  );
});

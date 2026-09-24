import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { userFile: { findFirst } },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: vi.fn().mockResolvedValue('org-1'),
}));
vi.mock('@/features/documents/services/queries/get-document-actor', () => ({
  getDocumentActor: vi.fn().mockResolvedValue({ userId: 'u1' }),
}));
vi.mock('@/features/documents/services/queries/document-access', () => ({
  fileAccessWhere: () => ({}),
}));
vi.mock('@/app/lib/services/storage', () => ({
  getFileFromS3: vi.fn(),
  getFileFromS3ByKey: vi.fn(),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET as getFile } from '../route';
import { GET as getThumbnail } from '../thumbnail/route';

const call = (handler: typeof getFile, fileId: string) =>
  handler({} as never, { params: Promise.resolve({ fileId }) });

beforeEach(() => {
  findFirst.mockReset();
});

describe('file routes with an id that is not one', () => {
  // Prisma throws P2023 for a non-uuid on a uuid column, and the catch turned
  // a typo in a URL into a 500.
  it.each([
    ['download', getFile],
    ['thumbnail', getThumbnail],
  ])('%s answers 404 without asking the database', async (_name, handler) => {
    const res = await call(handler, 'abc');

    expect(res.status).toBe(404);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('still looks up a well-formed id', async () => {
    findFirst.mockResolvedValue(null);
    const res = await call(getFile, '0a5aee2a-9877-4367-8915-452d50524d87');

    expect(findFirst).toHaveBeenCalled();
    expect(res.status).toBe(404);
  });
});

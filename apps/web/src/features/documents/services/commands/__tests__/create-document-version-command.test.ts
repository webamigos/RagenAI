import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  documentVersion: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
}));
const transaction = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { $transaction: (...args: unknown[]) => transaction(...args) },
}));

import { createDocumentVersionCommand } from '../create-document-version-command';

const input = {
  documentId: 'doc-1',
  organizationId: 'org-1',
  content: 'New content',
  title: 'Title',
  changeType: 'MANUAL' as const,
  authorId: 'user-1',
};

describe('createDocumentVersionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: 'doc-1' }]);
    tx.documentVersion.updateMany.mockResolvedValue({ count: 1 });
    transaction.mockImplementation(
      async (fn: (client: typeof tx) => unknown) => fn(tx),
    );
  });

  it('appends after the highest existing version', async () => {
    tx.documentVersion.findFirst.mockResolvedValue({ versionNumber: 3 });
    tx.documentVersion.create.mockResolvedValue({ versionNumber: 4 });

    const result = await createDocumentVersionCommand(input);

    expect(result.versionNumber).toBe(4);
    expect(tx.documentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionNumber: 4, isActive: true }),
    });
  });

  it('starts at 1 when the document has no versions yet', async () => {
    tx.documentVersion.findFirst.mockResolvedValue(null);
    tx.documentVersion.create.mockResolvedValue({ versionNumber: 1 });

    await createDocumentVersionCommand({ ...input, changeType: 'UPLOAD' });

    expect(tx.documentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionNumber: 1 }),
    });
  });

  it('locks the parent document before reading the highest version', async () => {
    tx.documentVersion.findFirst.mockResolvedValue({ versionNumber: 1 });
    tx.documentVersion.create.mockResolvedValue({ versionNumber: 2 });

    await createDocumentVersionCommand(input);

    // Reading inside the transaction is not enough under read-committed: two
    // concurrent saves both read N and both write N+1, and the unique
    // constraint fails the loser. The row lock makes the second one wait.
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.documentVersion.findFirst.mock.invocationCallOrder[0],
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('deactivates the previous active version in the same transaction', async () => {
    tx.documentVersion.findFirst.mockResolvedValue({ versionNumber: 1 });
    tx.documentVersion.create.mockResolvedValue({ versionNumber: 2 });

    await createDocumentVersionCommand(input);

    // A partial unique index allows only one active row per document, so this
    // has to happen before the insert, atomically with it.
    expect(tx.documentVersion.updateMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', organizationId: 'org-1', isActive: true },
      data: { isActive: false },
    });
    expect(
      tx.documentVersion.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.documentVersion.create.mock.invocationCallOrder[0]);
  });

  it('stamps the tenant on every query and on the row', async () => {
    tx.documentVersion.findFirst.mockResolvedValue(null);
    tx.documentVersion.create.mockResolvedValue({ versionNumber: 1 });

    await createDocumentVersionCommand(input);

    expect(tx.documentVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId: 'doc-1', organizationId: 'org-1' },
      }),
    );
    expect(tx.documentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org-1' }),
    });
  });
});

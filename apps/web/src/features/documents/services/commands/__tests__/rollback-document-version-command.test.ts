import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  userDocument: { findFirst: vi.fn(), updateMany: vi.fn() },
  documentVersion: { findFirst: vi.fn() },
}));
const createVersion = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({ default: dbMock }));
vi.mock('../create-document-version-command', () => ({
  createDocumentVersionCommand: createVersion,
}));

import { rollbackDocumentVersionCommand } from '../rollback-document-version-command';

const input = {
  documentId: 'doc-1',
  versionId: 'ver-2',
  authorId: 'user-1',
  orgId: 'org-1',
};

const target = {
  id: 'ver-2',
  versionNumber: 2,
  content: 'restored content',
  title: 'Restored title',
  metadata: { tag: 'x' },
  ragScore: { total: 71 },
};

describe('rollbackDocumentVersionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.userDocument.findFirst.mockResolvedValue({ id: 'doc-1' });
    dbMock.userDocument.updateMany.mockResolvedValue({ count: 1 });
    dbMock.documentVersion.findFirst.mockResolvedValue(target);
    createVersion.mockResolvedValue({ id: 'ver-5', versionNumber: 5 });
  });

  it('appends the restored content as a new version rather than rewriting history', async () => {
    const result = await rollbackDocumentVersionCommand(input);

    expect(result.versionNumber).toBe(5);
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        organizationId: 'org-1',
        content: 'restored content',
        title: 'Restored title',
        changeType: 'ROLLBACK',
        authorId: 'user-1',
        ragScore: { total: 71 },
        metadata: { tag: 'x' },
      }),
    );
  });

  it('names the restored version by number, not by uuid', async () => {
    await rollbackDocumentVersionCommand(input);

    // The comment is rendered in the history list, where a uuid says nothing.
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'Rollback to version 2' }),
    );
  });

  it('writes the restored content and title back onto the document', async () => {
    await rollbackDocumentVersionCommand(input);

    expect(dbMock.userDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', organizationId: 'org-1' },
        data: expect.objectContaining({
          content: 'restored content',
          title: 'Restored title',
        }),
      }),
    );
  });

  it('establishes tenancy from the document before touching any version', async () => {
    dbMock.userDocument.findFirst.mockResolvedValue(null);

    await expect(rollbackDocumentVersionCommand(input)).rejects.toThrow(
      'Document not found',
    );

    // documentId arrives from the URL. Without this check, an org could roll
    // back another tenant's document: the version lookup keyed on
    // (id, documentId) alone matches, and the new version lands in their
    // history with every existing version of theirs deactivated.
    expect(dbMock.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(createVersion).not.toHaveBeenCalled();
  });

  it('scopes the version lookup to the organization as well', async () => {
    await rollbackDocumentVersionCommand(input);

    expect(dbMock.documentVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ver-2', documentId: 'doc-1', organizationId: 'org-1' },
      }),
    );
  });

  it('throws when the version does not exist', async () => {
    dbMock.documentVersion.findFirst.mockResolvedValue(null);

    await expect(rollbackDocumentVersionCommand(input)).rejects.toThrow(
      'Version not found',
    );
    expect(createVersion).not.toHaveBeenCalled();
    expect(dbMock.userDocument.updateMany).not.toHaveBeenCalled();
  });
});

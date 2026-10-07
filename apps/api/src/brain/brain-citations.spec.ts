import type { Mock } from 'vitest';
import type { DocumentActor } from '@ragenai/rag-core';
import type { PrismaService } from '../prisma/prisma.service.js';
import { getBrainCitations } from './brain-citations.js';

const member: DocumentActor = {
  userId: 'u-1',
  teamIds: ['t-1'],
  scope: 'member',
};

function makeClient(
  pages: unknown[],
  files: unknown[],
): {
  client: PrismaService['client'];
  pageFind: Mock;
  fileFind: Mock;
} {
  const pageFind = vi.fn().mockResolvedValue(pages);
  const fileFind = vi.fn().mockResolvedValue(files);
  return {
    client: {
      knowledgePage: { findMany: pageFind },
      userFile: { findMany: fileFind },
    } as unknown as PrismaService['client'],
    pageFind,
    fileFind,
  };
}

const page = (over: Record<string, unknown> = {}) => ({
  title: 'Leave policy',
  accessibleBy: ['org:org-1'],
  publishedFileId: 'page-file',
  sources: [
    { fileId: 'a', span: '§1' },
    { fileId: 'b', span: '§2' },
  ],
  ...over,
});
const file = (id: string) => ({
  id,
  fileName: `${id}.pdf`,
  documentId: null,
  document: null,
});

describe('getBrainCitations', () => {
  it('asks nothing for no scope or no cited files', async () => {
    const { client, pageFind } = makeClient([], []);
    expect(
      await getBrainCitations(
        client,
        'org-1',
        { userId: 'u', teamIds: [], scope: 'none' },
        ['x'],
      ),
    ).toEqual({});
    expect(await getBrainCitations(client, 'org-1', member, [])).toEqual({});
    expect(pageFind).not.toHaveBeenCalled();
  });

  it('scopes both reads to the organization and filters sources by file access', async () => {
    const { client, pageFind, fileFind } = makeClient([page()], [file('a')]);

    const out = await getBrainCitations(client, 'org-1', member, ['page-file']);

    expect(
      (pageFind.mock.calls[0][0] as { where: object }).where,
    ).toMatchObject({
      organizationId: 'org-1',
      publishedAt: { not: null },
    });
    const fileWhere = (
      fileFind.mock.calls[0][0] as {
        where: { organizationId: string; OR: unknown[] };
      }
    ).where;
    expect(fileWhere.organizationId).toBe('org-1');
    // The member rule from rag-core, not a restatement: an org-wide arm and the
    // actor's own files.
    expect(fileWhere.OR).toContainEqual({ isOrgWide: true });
    expect(fileWhere.OR).toContainEqual({ ownerId: 'u-1' });
    expect(out['page-file'].sources.map((s) => s.fileName)).toEqual(['a.pdf']);
    expect(JSON.stringify(out)).not.toContain('b.pdf');
  });

  it('does not look up source files for a page the caller may not read', async () => {
    const { client, fileFind } = makeClient(
      [page({ accessibleBy: ['user:someone-else'] })],
      [],
    );

    expect(
      await getBrainCitations(client, 'org-1', member, ['page-file']),
    ).toEqual({});
    expect(fileFind).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  userFile: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { getBrainCitationsQuery, canReadPage } =
  await import('../services/queries/get-brain-citations-query');

import type { DocumentActor } from '@/features/documents/services/queries/document-access';

const member: DocumentActor = {
  userId: 'u-1',
  teamIds: ['t-1'],
  scope: 'member',
};
const owner: DocumentActor = {
  userId: 'u-9',
  teamIds: [],
  scope: 'organization',
};

const page = (overrides: Record<string, unknown> = {}) => ({
  title: 'Urlop',
  accessibleBy: ['org:org-1'],
  publishedFileId: 'vehicle-1',
  sources: [
    { fileId: 'f-a', span: '§1' },
    { fileId: 'f-b', span: 'p. 2' },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.knowledgePage.findMany.mockResolvedValue([]);
  db.userFile.findMany.mockResolvedValue([]);
});

describe('getBrainCitationsQuery', () => {
  it('asks only for published pages of the reader’s organization', async () => {
    await getBrainCitationsQuery('org-1', member, ['vehicle-1', 'x']);
    const { where } = db.knowledgePage.findMany.mock.calls[0][0];
    expect(where).toEqual({
      organizationId: 'org-1',
      publishedFileId: { in: ['vehicle-1', 'x'] },
      publishedAt: { not: null },
    });
  });

  it('names the sources the reader may open, and only those', async () => {
    db.knowledgePage.findMany.mockResolvedValue([page()]);
    // f-b is filtered out by fileAccessWhere — the database answers without it.
    db.userFile.findMany.mockResolvedValue([
      {
        id: 'f-a',
        fileName: 'a.pdf',
        documentId: null,
        document: { id: 'd-a' },
      },
    ]);
    const result = await getBrainCitationsQuery('org-1', member, ['vehicle-1']);
    expect(result).toEqual({
      'vehicle-1': {
        pageTitle: 'Urlop',
        sources: [{ fileName: 'a.pdf', documentId: 'd-a', span: '§1' }],
      },
    });
    const { where } = db.userFile.findMany.mock.calls[0][0];
    expect(where.organizationId).toBe('org-1');
    expect(where.id).toEqual({ in: ['f-a', 'f-b'] });
    // The file predicate every by-id read uses, not an organization-wide read.
    expect(where.OR).toBeDefined();
  });

  it('shows nothing for a page the reader is not a principal of', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      page({ accessibleBy: ['user:someone-else'] }),
    ]);
    const result = await getBrainCitationsQuery('org-1', member, ['vehicle-1']);
    expect(result).toEqual({});
    expect(db.userFile.findMany).not.toHaveBeenCalled();
  });

  it('answers a reader with no visibility without touching the database', async () => {
    const result = await getBrainCitationsQuery(
      'org-1',
      { userId: 'u-1', teamIds: [], scope: 'none' },
      ['vehicle-1'],
    );
    expect(result).toEqual({});
    expect(db.knowledgePage.findMany).not.toHaveBeenCalled();
  });

  it('keeps the page when none of its sources are visible', async () => {
    db.knowledgePage.findMany.mockResolvedValue([page()]);
    const result = await getBrainCitationsQuery('org-1', member, ['vehicle-1']);
    expect(result['vehicle-1']).toEqual({ pageTitle: 'Urlop', sources: [] });
  });
});

describe('canReadPage', () => {
  it('matches the reader’s user, team and organization principals', () => {
    expect(canReadPage('org-1', member, ['user:u-1'])).toBe(true);
    expect(canReadPage('org-1', member, ['team:t-1'])).toBe(true);
    expect(canReadPage('org-1', member, ['org:org-1'])).toBe(true);
    expect(canReadPage('org-1', member, ['org:org-2', 'team:t-2'])).toBe(false);
  });

  it('lets an organization-wide reader see every page', () => {
    expect(canReadPage('org-1', owner, ['user:u-1'])).toBe(true);
  });
});

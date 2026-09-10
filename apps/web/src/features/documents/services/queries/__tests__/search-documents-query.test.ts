import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockActor } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockActor: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: { userFile: { findMany: mockFindMany } },
}));
vi.mock('../get-document-actor', () => ({ getDocumentActor: mockActor }));

import { searchDocumentsQuery } from '../search-documents-query';

const whereOf = () => mockFindMany.mock.calls[0][0].where;

beforeEach(() => {
  mockFindMany.mockReset().mockResolvedValue([]);
  mockActor
    .mockReset()
    .mockResolvedValue({ userId: 'u1', teamIds: [], scope: 'member' });
});

describe('searchDocumentsQuery', () => {
  it('never searches outside the organization', async () => {
    await searchDocumentsQuery('org-1', 'umowa');

    expect(whereOf().organizationId).toBe('org-1');
  });

  it('applies the same access predicate as the knowledge page', async () => {
    // A search box is the easiest place in a product to leak the *existence*
    // of a document: a name alone confirms that a contract with a named client
    // exists. This runs `fileAccessWhere`, not a looser filter.
    await searchDocumentsQuery('org-1', 'umowa');

    expect(whereOf()).toHaveProperty('OR');
  });

  it('matches nothing for a non-member, rather than everything', async () => {
    mockActor.mockResolvedValue({ userId: 'u1', teamIds: [], scope: 'none' });

    await searchDocumentsQuery('org-1', 'umowa');

    expect(whereOf().id).toEqual({ in: [] });
  });

  it('matches case-insensitively on part of a name', async () => {
    await searchDocumentsQuery('org-1', 'Umowa');

    expect(whereOf().fileName).toEqual({
      contains: 'Umowa',
      mode: 'insensitive',
    });
  });

  it('does not query at all for an empty or blank search', async () => {
    // A palette calls this on every keystroke, including the one that clears
    // the box.
    await searchDocumentsQuery('org-1', '   ');

    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('caps the result count, because a palette shows a shortlist', async () => {
    await searchDocumentsQuery('org-1', 'a');

    expect(mockFindMany.mock.calls[0][0].take).toBe(5);
  });
});

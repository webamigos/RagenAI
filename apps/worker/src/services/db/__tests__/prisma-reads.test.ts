// The reads migrated to Prisma in ADR-40 step 2 that had no test before.
//
// What is worth asserting here is not "Prisma was called" but the two things
// that could regress silently: that every read is still scoped to the
// organisation, and that the shapes each function promises its callers survived
// the move off knex.

/* eslint-disable no-var */
var mockUserFileFindUnique: jest.Mock;
var mockUserDocumentFindUnique: jest.Mock;
var mockOrgSettingsFindUnique: jest.Mock;
/* eslint-enable no-var */

jest.mock('../prisma', () => {
  mockUserFileFindUnique = jest.fn();
  mockUserDocumentFindUnique = jest.fn();
  mockOrgSettingsFindUnique = jest.fn();
  return {
    getPrisma: () => ({
      userFile: { findUnique: mockUserFileFindUnique },
      userDocument: { findUnique: mockUserDocumentFindUnique },
      organizationSettings: { findUnique: mockOrgSettingsFindUnique },
    }),
  };
});

jest.mock('knex', () => ({
  __esModule: true,
  default: jest.fn(() => {
    const noop = jest.fn();
    return Object.assign(noop, { raw: jest.fn(), transaction: jest.fn() });
  }),
}));

import { db } from '../db';

beforeEach(() => {
  mockUserFileFindUnique.mockReset();
  mockUserDocumentFindUnique.mockReset();
  mockOrgSettingsFindUnique.mockReset();
});

describe('getUserFile', () => {
  // The org is part of the key being looked up rather than an extra filter, so
  // it cannot be dropped by someone editing a `where` clause later. That is
  // the property this migration is meant to buy.
  it('looks the row up by the compound (id, organizationId) key', async () => {
    mockUserFileFindUnique.mockResolvedValue({ id: 'file-1' });

    await db.getUserFile('file-1', 'org-1');

    expect(mockUserFileFindUnique).toHaveBeenCalledWith({
      where: { id_organizationId: { id: 'file-1', organizationId: 'org-1' } },
    });
  });

  it('returns null for a file that belongs to another org', async () => {
    mockUserFileFindUnique.mockResolvedValue(null);

    await expect(db.getUserFile('file-1', 'org-2')).resolves.toBeNull();
  });
});

describe('getOrgLiteLLMKeyEncrypted', () => {
  it('reads only that column, for that org', async () => {
    mockOrgSettingsFindUnique.mockResolvedValue({ litellmApiKey: 'enc-key' });

    await expect(db.getOrgLiteLLMKeyEncrypted('org-1')).resolves.toBe(
      'enc-key',
    );
    expect(mockOrgSettingsFindUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { litellmApiKey: true },
    });
  });

  it.each([
    ['no row', null],
    ['a null column', { litellmApiKey: null }],
  ])('returns null for %s', async (_label, row) => {
    mockOrgSettingsFindUnique.mockResolvedValue(row);

    await expect(db.getOrgLiteLLMKeyEncrypted('org-1')).resolves.toBeNull();
  });
});

describe('getUserDocument', () => {
  it('scopes the lookup by org and asks only for the content', async () => {
    mockUserDocumentFindUnique.mockResolvedValue({ content: '# Title' });

    await expect(
      db.getUserDocument({ documentId: 'doc-1', orgId: 'org-1' }),
    ).resolves.toEqual({ content: '# Title' });
    expect(mockUserDocumentFindUnique).toHaveBeenCalledWith({
      where: { id_organizationId: { id: 'doc-1', organizationId: 'org-1' } },
      select: { content: true },
    });
  });

  it('returns null when there is no such document in that org', async () => {
    mockUserDocumentFindUnique.mockResolvedValue(null);

    await expect(
      db.getUserDocument({ documentId: 'doc-1', orgId: 'org-1' }),
    ).resolves.toBeNull();
  });
});

describe('getOptimizationJobSuggestions', () => {
  const call = () =>
    db.getOptimizationJobSuggestions({ documentId: 'doc-1', orgId: 'org-1' });

  // knex pushed `metadata->'optimizationJob'->'suggestions'` into SQL; the
  // Prisma version reads the column and walks it. Same answer, and these cases
  // are where a hand-written walk would go wrong.
  it('returns the suggestions from the nested metadata path', async () => {
    const suggestions = [{ id: 's1' }, { id: 's2' }];
    mockUserDocumentFindUnique.mockResolvedValue({
      metadata: { optimizationJob: { suggestions } },
    });

    await expect(call()).resolves.toEqual(suggestions);
  });

  it.each([
    ['no row at all', null],
    ['a null metadata column', { metadata: null }],
    ['metadata without the job', { metadata: { other: true } }],
    ['a job without suggestions', { metadata: { optimizationJob: {} } }],
    [
      'suggestions that are not an array',
      { metadata: { optimizationJob: { suggestions: 'nope' } } },
    ],
  ])('returns an empty array for %s', async (_label, row) => {
    mockUserDocumentFindUnique.mockResolvedValue(row);

    await expect(call()).resolves.toEqual([]);
  });

  it('is scoped by org', async () => {
    mockUserDocumentFindUnique.mockResolvedValue({ metadata: null });

    await call();

    expect(mockUserDocumentFindUnique).toHaveBeenCalledWith({
      where: { id_organizationId: { id: 'doc-1', organizationId: 'org-1' } },
      select: { metadata: true },
    });
  });
});

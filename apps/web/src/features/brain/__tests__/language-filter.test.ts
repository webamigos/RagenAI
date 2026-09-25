import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFile: { findMany: vi.fn(), groupBy: vi.fn() },
  knowledgePageSource: { findMany: vi.fn() },
  knowledgePage: { groupBy: vi.fn() },
  knowledgeFinding: { groupBy: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const {
  extractableFilesInLanguage,
  findingsInScope,
  getBrainLanguageScopeQuery,
  getBrainLanguagesQuery,
} = await import('../services/queries/brain-language-scope');
const { getBrainStatusCountsQuery } =
  await import('../services/queries/get-brain-status-counts-query');
const { parseBrainLanguage } =
  await import('../contracts/brain-language.types');
const { withLanguage } = await import('../utils/with-language');
const { languageName } = await import('../utils/language-name');

beforeEach(() => vi.clearAllMocks());

describe('parseBrainLanguage', () => {
  it('takes a three-letter code or none, and nothing else', () => {
    expect(parseBrainLanguage('pol')).toBe('pol');
    expect(parseBrainLanguage(['eng', 'pol'])).toBe('eng');
    expect(parseBrainLanguage('none')).toBe('none');
    // A hand-edited address filters nothing rather than everything.
    for (const bad of [undefined, '', 'pl', 'POL', "pol' OR 1=1", 'polski']) {
      expect(parseBrainLanguage(bad)).toBeNull();
    }
  });
});

describe('withLanguage', () => {
  it('adds the language to a link, keeping its query and its fragment', () => {
    expect(withLanguage('/brain', 'pol')).toBe('/brain?lang=pol');
    expect(withLanguage('/brain?status=APPROVED', 'pol')).toBe(
      '/brain?status=APPROVED&lang=pol',
    );
    expect(withLanguage('/brain/findings?finding=x#finding-x', 'eng')).toBe(
      '/brain/findings?finding=x&lang=eng#finding-x',
    );
  });

  it('leaves a link alone with no language picked', () => {
    expect(withLanguage('/brain?status=STALE', null)).toBe(
      '/brain?status=STALE',
    );
  });
});

describe('languageName', () => {
  it('names franc’s codes in the reader’s language', () => {
    expect(languageName('pol', 'pl')).toBe('polski');
    expect(languageName('eng', 'en')).toBe('English');
  });

  it('shows a code Intl cannot name as the code', () => {
    expect(languageName('!!', 'pl')).toBe('!!');
  });
});

describe('getBrainLanguageScopeQuery', () => {
  it('is no scope at all with no language — every tab queries as before', async () => {
    expect(await getBrainLanguageScopeQuery('org-1', null)).toBeNull();
    expect(db.userFile.findMany).not.toHaveBeenCalled();
  });

  it('is the organization’s files in the language and the pages citing them', async () => {
    db.userFile.findMany.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }]);
    db.knowledgePageSource.findMany.mockResolvedValue([
      { pageId: 3 },
      { pageId: 7 },
    ]);
    expect(await getBrainLanguageScopeQuery('org-1', 'pol')).toEqual({
      fileIds: ['f1', 'f2'],
      pageIds: [3, 7],
    });
    expect(db.userFile.findMany.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      language: 'pol',
    });
    expect(db.knowledgePageSource.findMany.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      fileId: { in: ['f1', 'f2'] },
    });
  });

  it('reads none as the documents whose language was not detected', async () => {
    db.userFile.findMany.mockResolvedValue([]);
    expect(await getBrainLanguageScopeQuery('org-1', 'none')).toEqual({
      fileIds: [],
      pageIds: [],
    });
    expect(db.userFile.findMany.mock.calls[0]![0].where.language).toBeNull();
    expect(db.knowledgePageSource.findMany).not.toHaveBeenCalled();
  });
});

describe('the scope applied', () => {
  const scope = { fileIds: ['f1'], pageIds: [3] };

  it('takes a finding about one of the files, or naming one of the pages', () => {
    expect(findingsInScope(scope)).toEqual({
      OR: [{ fileId: { in: ['f1'] } }, { pageIds: { hasSome: [3] } }],
    });
  });

  it('narrows the documents tab without dropping what makes a file Brain’s', () => {
    const where = extractableFilesInLanguage('org-1', 'pol');
    expect(where.AND).toEqual([
      expect.objectContaining({ organizationId: 'org-1' }),
      { language: 'pol' },
    ]);
    expect(extractableFilesInLanguage('org-1', null)).not.toHaveProperty('AND');
  });

  it('counts the chips inside the scope, so they match the list', async () => {
    db.knowledgePage.groupBy.mockResolvedValue([]);
    db.knowledgeFinding.groupBy.mockResolvedValue([]);
    await getBrainStatusCountsQuery('org-1', scope);
    expect(db.knowledgePage.groupBy.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      id: { in: [3] },
    });
    expect(db.knowledgeFinding.groupBy.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      ...findingsInScope(scope),
    });
  });
});

describe('getBrainLanguagesQuery', () => {
  it('lists the languages Brain’s documents are in, most documents first', async () => {
    db.userFile.groupBy.mockResolvedValue([
      { language: 'eng', _count: { _all: 2 } },
      { language: null, _count: { _all: 1 } },
      { language: 'pol', _count: { _all: 9 } },
    ]);
    expect(await getBrainLanguagesQuery('org-1')).toEqual([
      { language: 'pol', documents: 9 },
      { language: 'eng', documents: 2 },
      { language: null, documents: 1 },
    ]);
    expect(db.userFile.groupBy.mock.calls[0]![0].where).toMatchObject({
      organizationId: 'org-1',
    });
  });
});

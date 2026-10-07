import { describe, expect, it } from 'vitest';
import type { DocumentActor } from '../document-access';
import {
  canReadPage,
  shapeBrainCitations,
  type CitedPage,
} from '../brain-citations';

const member: DocumentActor = {
  userId: 'u-1',
  teamIds: ['t-1'],
  scope: 'member',
};
const admin: DocumentActor = {
  userId: 'u-2',
  teamIds: [],
  scope: 'organization',
};

const page = (over: Partial<CitedPage> = {}): CitedPage => ({
  title: 'Leave policy',
  accessibleBy: ['org:org-1'],
  publishedFileId: 'page-file',
  sources: [
    { fileId: 'a', span: '§1' },
    { fileId: 'b', span: '§2' },
  ],
  ...over,
});
const file = (id: string) => ({ id, fileName: `${id}.pdf`, documentId: null });

describe('canReadPage', () => {
  it('lets an organization-scope reader read any page', () => {
    expect(canReadPage('org-1', admin, [])).toBe(true);
  });
  it.each([
    ['the org', ['org:org-1']],
    ['the user', ['user:u-1']],
    ['one of the teams', ['team:t-1']],
  ])('lets a member read a page widened to %s', (_n, principals) => {
    expect(canReadPage('org-1', member, principals)).toBe(true);
  });
  it('refuses a member a page widened to nobody they are', () => {
    expect(canReadPage('org-1', member, ['user:u-9', 'team:t-9'])).toBe(false);
    expect(canReadPage('org-1', member, [])).toBe(false);
  });
});

describe('shapeBrainCitations', () => {
  it('gives a reader who may see the page but only some sources just those', () => {
    const out = shapeBrainCitations('org-1', member, [page()], [file('a')]);
    expect(out['page-file'].sources.map((s) => s.fileName)).toEqual(['a.pdf']);
    expect(JSON.stringify(out)).not.toContain('b.pdf');
  });

  it('gives the page and no source list to a reader who may open none', () => {
    const out = shapeBrainCitations('org-1', member, [page()], []);
    expect(out['page-file']).toEqual({
      pageTitle: 'Leave policy',
      sources: [],
    });
  });

  it('omits a page the reader may not read', () => {
    const hidden = page({ accessibleBy: ['user:someone-else'] });
    expect(
      shapeBrainCitations('org-1', member, [hidden], [file('a'), file('b')]),
    ).toEqual({});
  });

  it('drops an unpublished page and repeats of the same source and span', () => {
    const out = shapeBrainCitations(
      'org-1',
      admin,
      [
        page({ publishedFileId: null }),
        page({
          publishedFileId: 'p2',
          sources: [
            { fileId: 'a', span: '§1' },
            { fileId: 'a', span: '§1' },
          ],
        }),
      ],
      [file('a')],
    );
    expect(Object.keys(out)).toEqual(['p2']);
    expect(out.p2.sources).toHaveLength(1);
  });
});

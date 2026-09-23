import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assembleCandidates,
  type CandidatePage,
  type ExtractionSource,
} from '../../extraction/assemble';
import { sha256 } from '../../text';
import { mergePageContent, type MergeablePage } from '../merge-pages';

/**
 * Built from `assembleCandidates`' real output rather than a hand-written
 * page, so a change to `renderPage` that the merge cannot read fails here
 * instead of in a reviewer's hands.
 */
const TEXT = readFileSync(
  join(
    import.meta.dirname,
    '..',
    '..',
    'extraction',
    '__tests__',
    'fixtures',
    'regulamin-pracy.md',
  ),
  'utf8',
);
const SOURCE: ExtractionSource = {
  organizationId: 'o1',
  fileId: '0b8e7a2c-1d3f-4e5a-9b6c-7d8e9f0a1b2c',
  documentVersionId: '1c9f8b3d-2e4a-4f6b-8c7d-8e9f0a1b2c3d',
  text: TEXT,
  principals: ['org:o1'],
};

const { pages } = assembleCandidates(SOURCE, [
  {
    entities: [
      {
        key: 'a',
        title: 'Wdrożenie',
        type: 'PROCESS',
        description: 'Start pracy.',
      },
      {
        key: 'b',
        title: 'Onboarding',
        type: 'PROCESS',
        description: 'To samo.',
      },
    ],
    claims: [
      {
        entityKey: 'a',
        statement: 'Dostęp jest nadawany pierwszego dnia.',
        quote:
          'Nowy pracownik otrzymuje dostęp do systemów w pierwszym dniu pracy.',
        locator: '§2',
      },
      {
        entityKey: 'b',
        statement: 'IT przygotowuje stanowisko.',
        quote: 'Za przygotowanie stanowiska odpowiada dział IT',
        locator: '§2',
      },
      {
        entityKey: 'b',
        statement: 'Dostęp od pierwszego dnia.',
        quote:
          'Nowy pracownik otrzymuje dostęp do systemów w pierwszym dniu pracy.',
        locator: '§2',
      },
    ],
    relations: [],
  },
]);

const page = (title: string): MergeablePage => {
  const p = pages.find((c: CandidatePage) => c.title === title);
  if (!p) {
    throw new Error(`fixture has no page ${title}`);
  }
  return { content: p.content, sources: p.sources };
};

describe('mergePageContent', () => {
  const target = page('Wdrożenie');
  const absorbed = page('Onboarding');
  const merged = mergePageContent(target, absorbed);

  it('keeps the target and appends the absorbed claims, renumbered', () => {
    expect(merged.ok).toBe(true);
    if (!merged.ok) {
      return;
    }
    const lines = merged.content.split('\n');
    expect(lines[0]).toBe('# Wdrożenie');
    expect(lines).toContain('- Dostęp jest nadawany pierwszego dnia. [1]');
    expect(lines).toContain('- IT przygotowuje stanowisko. [2]');
    expect(merged.content).not.toContain('Onboarding');
    expect(merged.contentHash).toBe(sha256(merged.content));
  });

  it('drops an absorbed claim whose quote the target already cites', () => {
    if (!merged.ok) {
      throw new Error('merge failed');
    }
    expect(merged.duplicates).toBe(1);
    expect(merged.addedSources.map((s) => s.quote)).toEqual([
      absorbed.sources[0]!.quote,
    ]);
    expect(merged.content).not.toContain('Dostęp od pierwszego dnia.');
  });

  it('numbers evidence to match the sources the page will have', () => {
    if (!merged.ok) {
      throw new Error('merge failed');
    }
    const evidence = merged.content
      .split('\n---\n')[1]!
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(evidence.map((l) => l.split('.')[0])).toEqual(['1', '2']);
    expect(evidence[1]).toContain('Za przygotowanie stanowiska');
  });

  it('produces a page it can merge into again', () => {
    if (!merged.ok) {
      throw new Error('merge failed');
    }
    const again = mergePageContent(
      {
        content: merged.content,
        sources: [...target.sources, ...merged.addedSources],
      },
      absorbed,
    );
    expect(again).toMatchObject({ ok: true, duplicates: 2, addedSources: [] });
  });

  it.each([
    ['no separator', '# T\n\n- a [1]\n'],
    ['statements out of order', '# T\n\n- a [2]\n\n---\n\n1. „x”\n'],
    ['evidence count off', '# T\n\n- a [1]\n\n---\n\n1. „x”\n2. „y”\n'],
  ])('refuses a page with %s', (_, content) => {
    expect(
      mergePageContent({ content, sources: [target.sources[0]!] }, absorbed),
    ).toEqual({ ok: false, reason: 'unrecognised-content' });
  });

  it('refuses when the sources do not match the numbered claims', () => {
    expect(
      mergePageContent({ content: target.content, sources: [] }, absorbed),
    ).toEqual({ ok: false, reason: 'unrecognised-content' });
  });
});

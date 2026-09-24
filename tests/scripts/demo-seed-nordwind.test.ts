import { describe, expect, it } from 'vitest';

import {
  assertQuoteIn,
  citedIndexes,
  computedFindings,
  QuoteNotFoundError,
  renderPageContent,
  spanFor,
  stableUuid,
  validateContent,
  vehicleFileName,
} from '../../scripts/demo/nordwind/build';
import { contentEn } from '../../scripts/demo/nordwind/content-en';
import { contentPl } from '../../scripts/demo/nordwind/content-pl';
import { PAGES } from '../../scripts/demo/nordwind/structure';
import {
  assertDemoDatabase,
  firstParagraph,
  parseLocales,
} from '../../scripts/demo/seed-nordwind';

/**
 * The Nordwind demo seed's content promises, checked without a database.
 *
 * The seed itself is proven by running it; what a unit test can catch earlier
 * is an edit to the content that breaks a promise the screenshots depend on —
 * a quote that no longer occurs in its document, a `[3]` with two sources, a
 * contradiction or stale page that silently stops being one.
 */

const dsn = (authority: string, db: string): string =>
  `postgresql://postgres:localpw@${authority}/${db}`;

describe.each([
  ['pl', contentPl],
  ['en', contentEn],
] as const)('%s content', (locale, content) => {
  it('validates: every quote is verbatim, every [n] has a source, every slug is unique', () => {
    const built = validateContent(content, locale);
    expect(built).toHaveLength(Object.keys(PAGES).length);
    expect(built.length).toBeGreaterThanOrEqual(40);
  });

  it('raises exactly one orphan, one owner-left page and one stale source', () => {
    expect(computedFindings(content)).toEqual({
      orphans: ['whistleblowing'],
      ownerLeft: ['frame-agreement'],
      stale: [{ page: 'remote-work', sourceIndex: 0 }],
    });
  });

  it('keeps the leave-days contradiction a contradiction: 26 in the policy, 20 in the FAQ', () => {
    const [policy] = content.pages['annual-leave']!.claims;
    const [faq] = content.pages['leave-faq']!.claims;
    expect(policy!.source.quote).toContain('26');
    expect(faq!.source.quote).toContain('20');
    expect(policy!.source.doc).not.toBe(faq!.source.doc);
  });

  it('gives the main assistant three or four threads, one citing a published Brain page', () => {
    const main = content.threads.hr ?? [];
    expect(main.length).toBeGreaterThanOrEqual(3);
    expect(main.length).toBeLessThanOrEqual(4);
    const first = main[0]!;
    const cited = citedIndexes(first.answer).map(
      (n) => first.sources[n - 1]!.ref,
    );
    expect(cited.some((ref) => ref.startsWith('page:'))).toBe(true);
  });

  it('has unanswered questions for knowledge analytics', () => {
    expect(content.analyticsQuestions.some((q) => q.docs.length === 0)).toBe(
      true,
    );
  });
});

describe('the two locales', () => {
  it('describe the same people, folders, documents and pages', () => {
    for (const key of [
      'people',
      'teams',
      'folders',
      'documents',
      'assistants',
      'pages',
    ] as const) {
      expect(Object.keys(contentEn[key]).sort()).toEqual(
        Object.keys(contentPl[key]).sort(),
      );
    }
  });
});

describe('renderPageContent', () => {
  it('writes the extractor shape: title, description, numbered claims, then the evidence', () => {
    const md = renderPageContent({
      title: 'Annual leave',
      description: 'How much leave.',
      claims: [
        {
          statement: '26 days.',
          quote: 'is entitled to\n26 days',
          locator: 'p. 1 · 1. Entitlement',
        },
        {
          statement: 'By 30 September.',
          quote: 'by 30 September',
          locator: '',
        },
      ],
    });
    expect(md).toBe(
      [
        '# Annual leave',
        '',
        'How much leave.',
        '',
        '- 26 days. [1]',
        '- By 30 September. [2]',
        '',
        '---',
        '',
        '1. (p. 1 · 1. Entitlement) „is entitled to 26 days”',
        '2. „by 30 September”',
        '',
      ].join('\n'),
    );
  });
});

describe('spanFor', () => {
  const text =
    '# T\n\n## 1. Scope\n\nAlpha beta.\n\n## 2. Limits\n\nGamma delta.\n\nSheet: Notes\n\nEpsilon.';

  it('names the heading above the quote', () => {
    expect(
      spanFor(text, 'Gamma delta.', { pageCount: null, pageLabel: 'p.' }),
    ).toBe('2. Limits');
    expect(
      spanFor(text, 'Epsilon.', { pageCount: null, pageLabel: 'p.' }),
    ).toBe('Sheet: Notes');
  });

  it('adds a page for paginated documents', () => {
    expect(
      spanFor(text, 'Alpha beta.', { pageCount: 4, pageLabel: 'p.' }),
    ).toMatch(/^p\. \d · 1\. Scope$/);
  });

  it('falls back to a dash when the quote is missing', () => {
    expect(spanFor(text, 'nowhere', { pageCount: 3, pageLabel: 'p.' })).toBe(
      '—',
    );
  });
});

describe('assertQuoteIn', () => {
  it('refuses a quote that is not verbatim', () => {
    expect(() =>
      assertQuoteIn('Twenty-six days.', 'Twenty six days.', 'x'),
    ).toThrow(QuoteNotFoundError);
    expect(() =>
      assertQuoteIn('Twenty-six days.', 'six days', 'x'),
    ).not.toThrow();
  });
});

describe('small helpers', () => {
  it('stableUuid is deterministic and UUID-v4 shaped', () => {
    expect(stableUuid('a')).toBe(stableUuid('a'));
    expect(stableUuid('a')).not.toBe(stableUuid('b'));
    expect(stableUuid('a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('citedIndexes lists each marker once, in order of appearance', () => {
    expect(citedIndexes('A [2] b [1] c [2] d [3]')).toEqual([2, 1, 3]);
  });

  it('vehicleFileName strips slashes and control characters', () => {
    expect(vehicleFileName('Diety / limity\tnoclegów')).toBe(
      'Diety limity noclegów',
    );
  });

  it('firstParagraph skips headings and tables', () => {
    expect(
      firstParagraph(
        '# Title\n\n| a | b |\n\nShort.\n\nThis paragraph is long enough to be what a retrieved chunk would show.',
      ),
    ).toBe(
      'This paragraph is long enough to be what a retrieved chunk would show.',
    );
  });

  it('parseLocales accepts pl, en and all', () => {
    expect(parseLocales(['--locale', 'pl'])).toEqual(['pl']);
    expect(parseLocales([])).toEqual(['pl', 'en']);
    expect(() => parseLocales(['--locale', 'de'])).toThrow();
  });
});

describe('assertDemoDatabase', () => {
  it('accepts only ragen_demo on this machine', () => {
    expect(() =>
      assertDemoDatabase(dsn('localhost:55432', 'ragen_demo')),
    ).not.toThrow();
    expect(() =>
      assertDemoDatabase(dsn('127.0.0.1:55432', 'ragen_demo')),
    ).not.toThrow();
  });

  it('refuses the working and e2e databases, and anything remote', () => {
    expect(() => assertDemoDatabase(dsn('localhost:55432', 'ragen'))).toThrow(
      /Refusing/,
    );
    expect(() =>
      assertDemoDatabase(dsn('localhost:55432', 'ragen_e2e')),
    ).toThrow(/Refusing/);
    expect(() =>
      assertDemoDatabase(dsn('db.example.com:5432', 'ragen_demo')),
    ).toThrow(/Refusing/);
    expect(() => assertDemoDatabase(undefined)).toThrow(/not set/);
  });
});

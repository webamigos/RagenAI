import type { AssembledCandidates } from '@ragenai/brain-core';
import { describe, expect, it } from 'vitest';

import {
  languageOf,
  measure,
  summarize,
  tableCoverage,
} from '../brain-eval-metrics.js';

const HASH = `sha256:${'a'.repeat(64)}`;

function page(description: string, quotes: string[], slug = 's') {
  return {
    slug,
    title: 'T',
    type: 'PROCESS' as const,
    content: `# T\n\n${description}\n\n- a statement [1]\n`,
    contentHash: HASH,
    accessibleBy: ['org:o'],
    sources: quotes.map((quote) => ({
      fileId: 'f',
      documentVersionId: 'v',
      span: '§1',
      quote,
      hash: HASH,
    })),
  };
}

describe('languageOf', () => {
  it.each([
    ['Zasady zwrotu biletów dla pasażerów kolei.', 'pl'],
    ['Wniosek składa się w systemie kadrowym.', 'pl'],
    ['The policy for refunding tickets to passengers.', 'en'],
    ['Company providing services.', null],
    ['KRS 0000917734', null],
  ])('%j → %s', (text, language) => {
    expect(languageOf(text)).toBe(language);
  });
});

describe('measure', () => {
  const assembled: AssembledCandidates = {
    pages: [
      page('Zasady zwrotu biletów dla pasażerów.', [
        'NIP 7412998301',
        'Zwrot należności następuje w terminie 14 dni od złożenia wniosku.',
      ]),
      page('The rules for refunds and the deadlines for them.', ['short one']),
    ],
    edges: [
      { fromSlug: 'a', toSlug: 'b', kind: 'k', origin: 'EXTRACTED' },
      { fromSlug: 'b', toSlug: 'a', kind: 'k', origin: 'INFERRED' },
    ],
    unverifiedClaims: 1,
    unverified: [],
    foldedTableRows: 0,
    completedTableRows: 0,
  };

  it('counts a description in the other language as the failure', () => {
    expect(measure(assembled, 'pl')).toMatchObject({
      descriptions: 2,
      descriptionsInLanguage: 1,
      descriptionsInOtherLanguage: 1,
    });
  });

  it('counts short quotes and edges by origin', () => {
    expect(measure(assembled, 'pl')).toMatchObject({
      claims: 3,
      shortQuotes: 2,
      edges: 2,
      edgesExtracted: 1,
      dropped: 1,
    });
  });
});

describe('measure, the graph', () => {
  it('counts pages with no edge and the communities the graph finds', () => {
    const quote = ['a quote that is long enough to count'];
    const metrics = measure(
      {
        pages: [
          page('Zasady.', quote, 'a'),
          page('Zasady.', quote, 'b'),
          page('Zasady.', quote, 'c'),
          page('Zasady.', quote, 'alone'),
        ],
        edges: [
          { fromSlug: 'a', toSlug: 'b', kind: 'k', origin: 'EXTRACTED' },
          { fromSlug: 'b', toSlug: 'c', kind: 'k', origin: 'INFERRED' },
        ],
        unverifiedClaims: 0,
        unverified: [],
        foldedTableRows: 0,
        completedTableRows: 0,
      },
      'pl',
    );
    expect(metrics.isolatedPages).toBe(1);
    // The chain, and the page on its own.
    expect(metrics.communities).toBe(2);
    expect(summarize([{ metrics, tokens: 0 }])).toMatchObject({
      isolatedPageShare: 0.25,
      pagesPerCommunity: 2,
    });
  });
});

describe('summarize', () => {
  it('turns counts into rates and counts failed runs', () => {
    const metrics = measure(
      {
        pages: [
          page('The rules for refunds.', [
            'a quote that is long enough to count',
          ]),
        ],
        edges: [],
        unverifiedClaims: 1,
        unverified: [],
        foldedTableRows: 0,
        completedTableRows: 0,
      },
      'pl',
    );
    const summary = summarize([
      { metrics, tokens: 100 },
      { metrics: null, tokens: 50 },
    ]);
    expect(summary).toMatchObject({
      documents: 2,
      failed: 1,
      claims: 1,
      dropRate: 0.5,
      wrongLanguageRate: 1,
      shortQuoteRate: 0,
      edgesPerDocument: 0,
      extractedEdgeShare: null,
      tokens: 150,
    });
  });
});

describe('tableCoverage', () => {
  const text =
    'Cennik.\n\n| Kod | Stawka |\n| --- | --- |\n| A-1 | 10 zł |\n| A-2 | 20 zł |\n| A-3 | 30 zł |\n';
  it('counts data rows, and the ones a kept claim quotes', () => {
    const assembled = {
      pages: [page('Cennik.', ['| A-1 | 10 zł |', 'A-3 | 30 zł'], 'cennik')],
      edges: [],
      unverifiedClaims: 0,
      unverified: [],
      foldedTableRows: 0,
      completedTableRows: 0,
    };
    // Header and separator are not rows; a quote of part of a row counts.
    expect(tableCoverage(text, assembled)).toEqual({ rows: 3, cited: 2 });
  });

  it('is nothing for a document without tables', () => {
    expect(
      tableCoverage('Tylko tekst.', {
        pages: [],
        edges: [],
        unverifiedClaims: 0,
        unverified: [],
        foldedTableRows: 0,
        completedTableRows: 0,
      }),
    ).toEqual({ rows: 0, cited: 0 });
  });
});

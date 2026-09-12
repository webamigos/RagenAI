import { describe, it, expect } from 'vitest';
import {
  tally,
  rate,
  formatTally,
  groupBy,
  crosstab,
  renderMarkdown,
} from '../lib/report';
import type { CaseResult, Report } from '../lib/types';

const result = (overrides: Partial<CaseResult>): CaseResult => ({
  questionId: 'q',
  arm: 'rag',
  lang: 'pl',
  docLang: 'pl',
  type: 'numeric',
  question: 'q?',
  answer: 'a',
  assertionsPassed: true,
  assertionFailures: [],
  rubricPassed: true,
  passed: true,
  answerMs: 1,
  durationMs: 1,
  ...overrides,
});

describe('tally / rate / formatTally', () => {
  it('counts passes out of the total', () => {
    expect(tally([result({}), result({ passed: false })])).toEqual({
      passed: 1,
      total: 2,
    });
  });

  it('reports a zero rate for an empty slice rather than dividing by zero', () => {
    expect(rate({ passed: 0, total: 0 })).toBe(0);
  });

  it('renders an empty slice as a dash, not as 0%', () => {
    expect(formatTally({ passed: 0, total: 0 })).toBe('—');
  });

  it('renders a populated slice with its percentage', () => {
    expect(formatTally({ passed: 3, total: 4 })).toBe('3/4 (75%)');
  });
});

describe('groupBy', () => {
  it('preserves first-seen key order', () => {
    const grouped = groupBy(['bb', 'a', 'cc', 'd'], (s) => String(s.length));
    expect([...grouped.keys()]).toEqual(['2', '1']);
    expect(grouped.get('2')).toEqual(['bb', 'cc']);
  });
});

describe('crosstab', () => {
  it('splits a slice across both arms', () => {
    const rows = crosstab(
      [
        result({ lang: 'pl', arm: 'rag', passed: true }),
        result({ lang: 'pl', arm: 'no-rag', passed: false }),
        result({ lang: 'en', arm: 'rag', passed: false }),
      ],
      (r) => r.lang,
    );
    expect(rows).toEqual([
      {
        key: 'pl',
        byArm: {
          rag: { passed: 1, total: 1 },
          'no-rag': { passed: 0, total: 1 },
        },
      },
      {
        key: 'en',
        byArm: {
          rag: { passed: 0, total: 1 },
          'no-rag': { passed: 0, total: 0 },
        },
      },
    ]);
  });
});

describe('renderMarkdown', () => {
  const report: Report = {
    corpus: 'test-corpus',
    corpusVersion: 1,
    fingerprint: {
      date: '2026-09-12',
      gitSha: 'abc1234',
      chatModel: 'gemini-3-flash-preview',
      judgeModel: 'gemini-2.5-flash',
      rephraseModel: 'mistral-small-3.2',
      embeddingsModel: 'bge-multilingual-gemma2',
      vectorSize: '3584',
      rerankProvider: 'scaleway',
      rerankModel: 'qwen3-embedding-8b',
      rerankingEnabled: 'on',
      multiQueryVariants: '1',
      appUrl: 'http://localhost:3000',
    },
    results: [
      result({ questionId: 'pl-1', lang: 'pl', docLang: 'pl' }),
      result({
        questionId: 'xl-1',
        lang: 'pl',
        docLang: 'en',
        passed: false,
        assertionFailures: ['missing: "62"'],
      }),
      result({ questionId: 'pl-1', arm: 'no-rag', passed: false }),
    ],
  };

  it('records the stack the numbers came from', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('bge-multilingual-gemma2');
    expect(md).toContain('abc1234');
    expect(md).toContain('2026-09-12');
  });

  it('separates same-language from cross-lingual', () => {
    expect(renderMarkdown(report)).toContain('cross-lingual');
  });

  it('lists only the RAG arm in the per-case table', () => {
    const md = renderMarkdown(report);
    const detail = md.slice(md.indexOf('Per-case detail'));
    expect(detail).toContain('`pl-1`');
    expect(detail).toContain('`xl-1`');
    expect(detail).toContain('missing: "62"');
  });

  // A pipe inside a failure note would otherwise split the table cell.
  it('escapes a pipe in a failure note', () => {
    const md = renderMarkdown({
      ...report,
      results: [
        result({ passed: false, assertionFailures: ['none of: a | b'] }),
      ],
    });
    expect(md).toContain('none of: a \\| b');
  });
});

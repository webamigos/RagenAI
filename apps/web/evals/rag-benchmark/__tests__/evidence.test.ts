import { describe, expect, it, vi } from 'vitest';

import {
  chunkTextsFor,
  evidenceFor,
  evidenceSection,
  tallyEvidence,
} from '../lib/evidence';
import { parseRagStream } from '../lib/arms';
import type { CaseResult } from '../lib/types';

describe('evidenceFor', () => {
  it('counts each expectAll needle, and expectAny as one', () => {
    expect(
      evidenceFor(
        {
          expectAll: ['87', 'CD-1104'],
          expectAny: ['14 dni', 'fourteen days'],
        },
        ['Limit CD-1104 wynosi 87 sztuk.', 'Płatne w ciągu 14 dni.'],
      ),
    ).toEqual({ needles: 3, found: 3 });
  });

  it('reads figures the way the assertions do', () => {
    expect(
      evidenceFor({ expectAll: ['4 180 000'] }, ['Budżet: 4180000 PLN.']),
    ).toEqual({ needles: 1, found: 1 });
  });

  it('reports what is missing from the context', () => {
    expect(
      evidenceFor({ expectAll: ['87', '249,50'] }, ['Only 87 here.']),
    ).toEqual({ needles: 2, found: 1 });
  });

  it('is null for a question with no evidence to find', () => {
    expect(evidenceFor({}, ['anything'])).toBeNull();
  });
});

describe('chunkTextsFor', () => {
  it('returns texts in the order given, one scroll per file', async () => {
    const scroll = vi.fn(async (fileId: string, indexes: number[]) =>
      indexes.map((i) => ({ chunkIndex: i, text: `${fileId}:${i}` })),
    );
    const texts = await chunkTextsFor(
      [
        { fileId: 'b', chunkIndex: 4 },
        { fileId: 'a', chunkIndex: 2 },
        { fileId: 'b', chunkIndex: 1 },
      ],
      scroll,
    );
    expect(texts).toEqual(['b:4', 'a:2', 'b:1']);
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('skips a position the store no longer holds', async () => {
    const texts = await chunkTextsFor(
      [
        { fileId: 'a', chunkIndex: 1 },
        { fileId: 'a', chunkIndex: 9 },
      ],
      async () => [{ chunkIndex: 1, text: 'kept' }],
    );
    expect(texts).toEqual(['kept']);
  });
});

const result = (over: Partial<CaseResult>): CaseResult =>
  ({
    questionId: 'q',
    arm: 'rag',
    lang: 'pl',
    docLang: 'pl',
    type: 'lookup',
    question: '',
    answer: '',
    assertionsPassed: true,
    assertionFailures: [],
    rubricPassed: null,
    passed: true,
    answerMs: 0,
    durationMs: 0,
    ...over,
  }) as CaseResult;

describe('tallyEvidence and the report section', () => {
  const results = [
    result({ evidence: { needles: 2, found: 2 } }),
    result({ evidence: { needles: 2, found: 1 }, lang: 'pl', docLang: 'en' }),
    result({}),
    result({ arm: 'no-rag', evidence: { needles: 9, found: 0 } }),
  ];

  it('counts only RAG cases that had evidence to find', () => {
    expect(tallyEvidence(results)).toEqual({
      cases: 2,
      complete: 1,
      needles: 4,
      found: 3,
    });
  });

  it('renders one row per slice', () => {
    const section = evidenceSection(results);
    expect(section).toContain(
      '| all questions | 3/4 (75%); all evidence in context 1/2 |',
    );
    expect(section).toContain(
      '| cross-lingual | 1/2 (50%); all evidence in context 0/1 |',
    );
  });
});

describe('parseRagStream — the retrieval trace', () => {
  it('reads the trace from the retrieval event', () => {
    const raw = [
      'event: retrieval',
      `data: ${JSON.stringify({
        sources: [],
        chunkCount: 1,
        durationMs: 5,
        trace: {
          chunks: [{ fileId: 'f', chunkIndex: 3 }, { fileId: 7 }],
          postRetrieval: 'fusion',
          queryCount: 2,
          timings: { searchMs: 4, rerankMs: 0, rephraseMs: 90 },
        },
      })}`,
      '',
      `data: ${JSON.stringify({ content: 'Answer.' })}`,
      '',
    ].join('\n');

    const parsed = parseRagStream(raw);
    expect(parsed.text).toBe('Answer.');
    expect(parsed.trace).toEqual({
      chunks: [{ fileId: 'f', chunkIndex: 3 }],
      postRetrieval: 'fusion',
      queryCount: 2,
      timings: { searchMs: 4, rerankMs: 0, rephraseMs: 90 },
    });
  });

  it('has no trace when an older app sends none', () => {
    const raw = `event: retrieval\ndata: ${JSON.stringify({ sources: [], chunkCount: 0, durationMs: 0 })}\n\n`;
    expect(parseRagStream(raw)).not.toHaveProperty('trace');
  });
});

import { describe, it, expect } from 'vitest';
import { validateCorpus } from '../lib/corpus';
import type { Corpus, Question } from '../lib/types';

const corpus: Corpus = {
  name: 'test',
  version: 1,
  license: 'CC0-1.0',
  languages: ['pl', 'en'],
  documents: [
    { file: 'docs/a.md', lang: 'pl', mimeType: 'text/markdown' },
    { file: 'docs/b.md', lang: 'en', mimeType: 'text/markdown' },
  ],
};

const question = (overrides: Partial<Question>): Question => ({
  id: 'q1',
  lang: 'pl',
  docLang: 'pl',
  type: 'numeric',
  question: 'q?',
  expectAll: ['87'],
  ...overrides,
});

describe('validateCorpus', () => {
  it('accepts a well-formed corpus', () => {
    expect(validateCorpus(corpus, [question({})])).toEqual([]);
  });

  // Two rows sharing an id collapse into one in every per-slice tally, so the
  // report reads as if a question were never asked.
  it('rejects a duplicate question id', () => {
    const problems = validateCorpus(corpus, [
      question({ id: 'dup' }),
      question({ id: 'dup' }),
    ]);
    expect(problems).toContain('duplicate question id "dup"');
  });

  // A question with no gate passes unconditionally and inflates every rate it
  // appears in — the failure mode that makes a benchmark worse than none.
  it('rejects a question with neither an expectation nor a rubric', () => {
    const problems = validateCorpus(corpus, [
      question({ id: 'empty', expectAll: undefined }),
    ]);
    expect(problems).toEqual([
      'question "empty" has neither an expectation nor a rubric, so it can never fail',
    ]);
  });

  // `expectNone` alone is passed by an answer that says nothing at all, so a
  // negative-only question counts a refusal — or an empty string — as a win.
  it('rejects a question whose only gate is expectNone', () => {
    const problems = validateCorpus(corpus, [
      question({ id: 'neg-only', expectAll: undefined, expectNone: ['90'] }),
    ]);
    expect(problems).toEqual([
      'question "neg-only" only says what the answer must not contain, so an empty answer passes it',
    ]);
  });

  it('accepts expectNone alongside a positive gate', () => {
    expect(
      validateCorpus(corpus, [
        question({ id: 'both', expectAll: ['87'], expectNone: ['90'] }),
      ]),
    ).toEqual([]);
    expect(
      validateCorpus(corpus, [
        question({
          id: 'rubric-and-neg',
          expectAll: undefined,
          rubric: 'refuses rather than inventing a figure',
          expectNone: ['90'],
        }),
      ]),
    ).toEqual([]);
  });

  it('rejects a question asked in an undeclared language', () => {
    const problems = validateCorpus(corpus, [question({ lang: 'de' })]);
    expect(problems).toContain(
      'question "q1" asks in "de", which corpus.json does not list',
    );
  });

  it('rejects a question pointing at an undeclared document language', () => {
    const problems = validateCorpus(corpus, [question({ docLang: 'fr' })]);
    expect(problems).toContain(
      'question "q1" points at docLang "fr", which corpus.json does not list',
    );
  });

  it('rejects a document in an undeclared language', () => {
    const problems = validateCorpus(
      {
        ...corpus,
        documents: [
          { file: 'docs/c.md', lang: 'es', mimeType: 'text/markdown' },
        ],
      },
      [question({})],
    );
    expect(problems).toContain(
      'document docs/c.md has lang "es", which corpus.json does not list',
    );
  });

  it('rejects an empty corpus', () => {
    const problems = validateCorpus({ ...corpus, documents: [] }, [
      question({}),
    ]);
    expect(problems).toContain('corpus.json declares no documents');
  });

  it('rejects a corpus with no questions', () => {
    expect(validateCorpus(corpus, [])).toContain(
      'questions.json declares no questions',
    );
  });
});

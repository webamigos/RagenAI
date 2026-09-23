import { describe, expect, it, vi } from 'vitest';

import { ExtractionBudget } from '../../extraction/budget';
import type { GenerateStructured } from '../../extraction/extract-document';
import {
  contradictionUserPrompt,
  judgeContradictions,
  MAX_CLAIMS_PER_SIDE,
  type JudgedPage,
} from '../judge';

const usage = { inputTokens: 100, outputTokens: 20 };
const A: JudgedPage = {
  title: 'Urlop',
  claims: [
    { sourceId: 10, quote: 'Urlop wypoczynkowy wynosi 26 dni.' },
    { sourceId: 11, quote: 'Wniosek zatwierdza przełożony.' },
  ],
};
const B: JudgedPage = {
  title: 'Urlop',
  claims: [{ sourceId: 20, quote: 'Urlop wypoczynkowy wynosi 20 dni.' }],
};
const budget = () => new ExtractionBudget({ maxDocuments: 10, maxTokens: 1e6 });
const answering = (object: unknown) =>
  vi.fn<GenerateStructured>(async () => ({ object, usage }));

describe('judgeContradictions', () => {
  it('maps the passage numbers it was given back to source ids', async () => {
    const generate = answering({
      contradictions: [{ a: 1, b: 1, explanation: '26 dni wobec 20 dni.' }],
    });
    const outcome = await judgeContradictions({
      a: A,
      b: B,
      generate,
      budget: budget(),
    });
    expect(outcome).toMatchObject({
      status: 'judged',
      contradictions: [
        { aSourceId: 10, bSourceId: 20, explanation: '26 dni wobec 20 dni.' },
      ],
      rejectedItems: 0,
      truncated: false,
      usage,
    });
  });

  // The answer is the model's; what it points at must exist.
  it('drops an item naming a passage that was not shown, or repeating one', async () => {
    const generate = answering({
      contradictions: [
        { a: 1, b: 1, explanation: 'ok' },
        { a: 1, b: 1, explanation: 'again' },
        { a: 3, b: 1, explanation: 'no such A' },
        { a: 1, b: 0, explanation: 'no such B' },
        { a: 1.5, b: 1, explanation: 'not a number of a passage' },
        { a: 2, b: 1, explanation: '   ' },
      ],
    });
    const outcome = await judgeContradictions({
      a: A,
      b: B,
      generate,
      budget: budget(),
    });
    expect(outcome).toMatchObject({ status: 'judged', rejectedItems: 5 });
    if (outcome.status === 'judged') {
      expect(outcome.contradictions).toHaveLength(1);
    }
  });

  it('retries once with the problem fed back, then fails', async () => {
    const generate = answering({ nope: true });
    const outcome = await judgeContradictions({
      a: A,
      b: B,
      generate,
      budget: budget(),
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toContain(
      'previous answer was rejected',
    );
    expect(outcome).toMatchObject({
      status: 'failed',
      usage: { inputTokens: 200, outputTokens: 40 },
    });
  });

  it('keeps no document text in a failure reason', async () => {
    const generate = vi.fn<GenerateStructured>(async () => {
      throw new TypeError(
        'the request said: Urlop wypoczynkowy wynosi 26 dni.',
      );
    });
    const outcome = await judgeContradictions({
      a: A,
      b: B,
      generate,
      budget: budget(),
    });
    expect(outcome).toEqual({
      status: 'failed',
      reason: 'the call failed (TypeError)',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it('asks nothing when a side has no passages', async () => {
    const generate = answering({ contradictions: [] });
    const outcome = await judgeContradictions({
      a: A,
      b: { title: 'Urlop', claims: [] },
      generate,
      budget: budget(),
    });
    expect(generate).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: 'judged', contradictions: [] });
  });

  it('is refused by an exhausted budget before any call', async () => {
    const generate = answering({ contradictions: [] });
    const spent = new ExtractionBudget({ maxDocuments: 10, maxTokens: 10 });
    spent.charge({ inputTokens: 10, outputTokens: 0 });
    const outcome = await judgeContradictions({
      a: A,
      b: B,
      generate,
      budget: spent,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(outcome.status).toBe('budget_exhausted');
  });

  it('counts each pair against the budget’s document ceiling', async () => {
    const generate = answering({ contradictions: [] });
    const one = new ExtractionBudget({ maxDocuments: 1, maxTokens: 1e6 });
    await judgeContradictions({ a: A, b: B, generate, budget: one });
    const second = await judgeContradictions({
      a: A,
      b: B,
      generate,
      budget: one,
    });
    expect(second.status).toBe('budget_exhausted');
  });

  it('shows at most MAX_CLAIMS_PER_SIDE passages, and says it cut', async () => {
    const many: JudgedPage = {
      title: 'Urlop',
      claims: Array.from({ length: MAX_CLAIMS_PER_SIDE + 5 }, (_, i) => ({
        sourceId: i,
        quote: `Passage number ${i}.`,
      })),
    };
    const generate = answering({ contradictions: [] });
    const outcome = await judgeContradictions({
      a: many,
      b: B,
      generate,
      budget: budget(),
    });
    expect(outcome).toMatchObject({ truncated: true });
    expect(generate.mock.calls[0][0].prompt).not.toContain(
      `${MAX_CLAIMS_PER_SIDE + 1}. `,
    );
  });
});

describe('contradictionUserPrompt', () => {
  it('numbers each side’s passages from one, on one line each', () => {
    const prompt = contradictionUserPrompt(
      { title: 'A', claims: [{ sourceId: 1, quote: 'line one\nline two' }] },
      B,
    );
    expect(prompt).toBe(
      'Write every explanation in the language of the passages.\n\n' +
        'Page A: A\n1. line one line two\n\nPage B: Urlop\n1. Urlop wypoczynkowy wynosi 20 dni.',
    );
  });

  // "The language of the passages" was not enough on a real model.
  it('names the explanation language outright when it is known', () => {
    expect(
      contradictionUserPrompt({ ...A, language: 'pol' }, B).split('\n')[0],
    ).toBe('Write every explanation in Polish.');
  });

  it('takes page B’s language when A’s is unknown', () => {
    expect(
      contradictionUserPrompt(A, { ...B, language: 'eng' }).split('\n')[0],
    ).toBe('Write every explanation in English.');
  });
});

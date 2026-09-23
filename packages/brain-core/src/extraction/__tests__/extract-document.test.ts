import { describe, expect, it, vi } from 'vitest';

import { ExtractionBudget } from '../budget';
import {
  describeFailure,
  extractDocument,
  type GenerateStructured,
} from '../extract-document';

const USAGE = { inputTokens: 100, outputTokens: 50 };
const EMPTY = { entities: [], claims: [], relations: [] };

const roomy = () =>
  new ExtractionBudget({ maxDocuments: 10, maxTokens: 1_000_000 });

describe('extractDocument', () => {
  it('returns one result per window', async () => {
    const generate = vi.fn<GenerateStructured>(async () => ({
      object: EMPTY,
      usage: USAGE,
    }));
    const outcome = await extractDocument({
      fileName: 'a.md',
      text: `${'a'.repeat(90)}\n\n${'b'.repeat(90)}`,
      generate,
      budget: roomy(),
      maxWindowChars: 100,
    });
    expect(outcome.status).toBe('extracted');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(outcome.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  // Spec failure mode: one automatic retry with the parse error fed back.
  it('retries once, telling the model what was wrong', async () => {
    const generate = vi
      .fn<GenerateStructured>()
      .mockResolvedValueOnce({ object: { entities: 'x' }, usage: USAGE })
      .mockResolvedValueOnce({ object: EMPTY, usage: USAGE });
    const outcome = await extractDocument({
      fileName: 'a.md',
      text: 'short document',
      generate,
      budget: roomy(),
    });
    expect(outcome.status).toBe('extracted');
    const retry = generate.mock.calls[1]![0].prompt;
    expect(retry).toContain('previous answer was rejected');
    expect(retry).toContain('entities: invalid_type');
  });

  it('fails after the retry, naming the window', async () => {
    const generate = vi.fn<GenerateStructured>(async () => ({
      object: { nope: true },
      usage: USAGE,
    }));
    const outcome = await extractDocument({
      fileName: 'a.md',
      text: 'short document',
      generate,
      budget: roomy(),
    });
    expect(outcome).toMatchObject({ status: 'failed', windowIndex: 0 });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  // The reason lands in a finding people read, and is fed back to the model.
  it('never carries the rejected value or a thrown message', async () => {
    const secret = 'PESEL 90010112345';
    const generate = vi
      .fn<GenerateStructured>()
      .mockResolvedValueOnce({
        object: { entities: secret, claims: [], relations: [] },
        usage: USAGE,
      })
      .mockRejectedValueOnce(
        Object.assign(new Error(`provider echoed: ${secret}`), {
          name: 'AI_APICallError',
          requestBodyValues: { prompt: secret },
        }),
      );
    const outcome = await extractDocument({
      fileName: 'a.md',
      text: secret,
      generate,
      budget: roomy(),
    });
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.reason).not.toContain('90010112345');
      expect(outcome.reason).toContain('AI_APICallError');
    }
    expect(generate.mock.calls[1]![0].prompt).toContain(secret); // the document itself, as it must be
    expect(
      generate.mock.calls[1]![0].prompt.split('rejected:')[1],
    ).not.toContain('90010112345');
  });

  it('stops before a call once the token ceiling is reached', async () => {
    const budget = new ExtractionBudget({ maxDocuments: 10, maxTokens: 150 });
    const generate = vi.fn<GenerateStructured>(async () => ({
      object: EMPTY,
      usage: USAGE,
    }));
    const outcome = await extractDocument({
      fileName: 'a.md',
      text: `${'a'.repeat(90)}\n\n${'b'.repeat(90)}`,
      generate,
      budget,
      maxWindowChars: 100,
    });
    // First call spends 150, reaching the ceiling; the second never starts,
    // and the half-extracted document is not returned.
    expect(outcome.status).toBe('budget_exhausted');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('refuses a document once the document ceiling is reached, at no cost', async () => {
    const budget = new ExtractionBudget({ maxDocuments: 1, maxTokens: 1e9 });
    const generate = vi.fn<GenerateStructured>(async () => ({
      object: EMPTY,
      usage: USAGE,
    }));
    const input = { fileName: 'a.md', text: 'doc', generate, budget };
    expect((await extractDocument(input)).status).toBe('extracted');
    expect((await extractDocument(input)).status).toBe('budget_exhausted');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('counts a failed attempt against the budget', async () => {
    const budget = new ExtractionBudget({ maxDocuments: 10, maxTokens: 1e9 });
    await extractDocument({
      fileName: 'a.md',
      text: 'doc',
      generate: async () => ({ object: null, usage: USAGE }),
      budget,
    });
    expect(budget.snapshot().tokens).toBe(300);
  });
});

describe('describeFailure', () => {
  it('names the error class and nothing else', () => {
    expect(describeFailure(new TypeError('secret text'))).toBe(
      'the call failed (TypeError)',
    );
  });

  it('copes with a thrown non-error', () => {
    expect(describeFailure('secret text')).toBe('the call failed');
  });
});

describe('ExtractionBudget', () => {
  it.each([
    [{ maxDocuments: -1, maxTokens: 1 }],
    [{ maxDocuments: 1, maxTokens: Number.NaN }],
    [{ maxDocuments: Infinity, maxTokens: 1 }],
  ])('refuses the limits %j', (limits) => {
    expect(() => new ExtractionBudget(limits)).toThrow(RangeError);
  });

  it('admits nothing with a zero budget', () => {
    expect(
      new ExtractionBudget({ maxDocuments: 0, maxTokens: 10 }).admitDocument(),
    ).toBe(false);
  });
});

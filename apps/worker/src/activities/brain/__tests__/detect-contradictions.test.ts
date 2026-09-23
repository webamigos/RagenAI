import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  loadContradictionCandidates: vi.fn(),
  recordContradictionJudgement: vi.fn(),
}));
const db = vi.hoisted(() => ({ trackAiUsage: vi.fn() }));
const generate = vi.hoisted(() => vi.fn());

vi.mock('../../../services/db/brain-contradictions.js', () => store);
vi.mock('../../../services/db/db.js', () => ({ db }));
vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn(async () => ({})),
}));
vi.mock('../structured-generator.js', () => ({
  structuredGenerator: () => generate,
}));

import { detectContradictions } from '../detect-contradictions.js';

const page = (id: number, fileId: string, published = false) => ({
  id,
  title: 'Urlop',
  fileIds: [fileId],
  published,
  judged: {
    title: 'Urlop',
    claims: [{ sourceId: id * 10, quote: `passage of page ${id}` }],
  },
});
const usage = { inputTokens: 100, outputTokens: 10 };
const input = {
  orgId: 'org-1',
  fileIds: ['f-run'],
  userId: 'user-1',
  maxTokens: 1e6,
  runId: 'run-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  store.loadContradictionCandidates.mockResolvedValue({
    pages: [page(1, 'f-old', true), page(2, 'f-run')],
    touched: new Set([2]),
  });
  store.recordContradictionJudgement.mockResolvedValue('raised');
  generate.mockResolvedValue({
    object: { contradictions: [{ a: 1, b: 1, explanation: '26 vs 20' }] },
    usage,
  });
});

describe('detectContradictions', () => {
  it('judges each pair and records it with the passages as source ids', async () => {
    const result = await detectContradictions(input);
    expect(store.loadContradictionCandidates).toHaveBeenCalledWith('org-1', [
      'f-run',
    ]);
    expect(store.recordContradictionJudgement).toHaveBeenCalledWith({
      orgId: 'org-1',
      pageIds: [1, 2],
      contradictions: [
        { aSourceId: 10, bSourceId: 20, explanation: '26 vs 20' },
      ],
      truncated: false,
      published: true,
      runId: 'run-1',
    });
    expect(result).toEqual({
      pairs: 1,
      raised: 1,
      cleared: 0,
      failed: 0,
      notJudged: 0,
      tokens: 110,
    });
  });

  it('records the tokens it spent as AI usage', async () => {
    await detectContradictions(input);
    expect(db.trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        inputTokens: 100,
        outputTokens: 10,
        metadata: { kind: 'brain_contradictions', runId: 'run-1' },
      }),
    );
  });

  it('calls no model when there is no pair', async () => {
    store.loadContradictionCandidates.mockResolvedValue({
      pages: [page(1, 'f-run')],
      touched: new Set([1]),
    });
    const result = await detectContradictions(input);
    expect(generate).not.toHaveBeenCalled();
    expect(db.trackAiUsage).not.toHaveBeenCalled();
    expect(result.pairs).toBe(0);
  });

  // The run's ceiling is the run's: this gets only what extraction left.
  it('stops judging when the run tokens it was handed are spent', async () => {
    store.loadContradictionCandidates.mockResolvedValue({
      pages: [page(1, 'f-a'), page(2, 'f-run'), page(3, 'f-b')],
      touched: new Set([2]),
    });
    const result = await detectContradictions({ ...input, maxTokens: 110 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ pairs: 2, raised: 1, notJudged: 1 });
  });

  it('counts a pair that could not be judged, and raises nothing for it', async () => {
    generate.mockResolvedValue({ object: { wrong: true }, usage });
    const result = await detectContradictions(input);
    expect(store.recordContradictionJudgement).not.toHaveBeenCalled();
    expect(result).toMatchObject({ failed: 1, raised: 0, tokens: 220 });
  });

  it('records usage even when a write throws half-way', async () => {
    store.recordContradictionJudgement.mockRejectedValue(new Error('db'));
    await expect(detectContradictions(input)).rejects.toThrow('db');
    expect(db.trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: 110 }),
    );
  });
});

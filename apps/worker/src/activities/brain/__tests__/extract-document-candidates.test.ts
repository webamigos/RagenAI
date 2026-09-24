import { beforeEach, describe, expect, it, vi } from 'vitest';

const brainDb = vi.hoisted(() => ({
  getExtractionSource: vi.fn(),
  recordExtractionFailed: vi.fn(),
  replaceCandidatesFromFile: vi.fn(),
  resolveExtractionFailed: vi.fn(),
}));
const trackAiUsage = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));

vi.mock('../../../services/db/brain.js', () => brainDb);
vi.mock('../../../services/db/db.js', () => ({ db: { trackAiUsage } }));
vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn().mockResolvedValue({ id: 'model' }),
}));
vi.mock('../../../services/logger.js', () => ({ logger }));
vi.mock('../../db/compute-file-access-principals.js', () => ({
  computeFileAccessPrincipals: vi.fn().mockResolvedValue(['team:hr']),
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject,
}));

import { NoObjectGeneratedError } from 'ai';

import { extractDocumentCandidates } from '../extract-document-candidates.js';

const TEXT =
  '## §2 Wdrożenie\n\nNowy pracownik otrzymuje dostęp do systemów w pierwszym dniu pracy.';
const INPUT = {
  orgId: 'org-1',
  fileId: '0b8e7a2c-1d3f-4e5a-9b6c-7d8e9f0a1b2c',
  userId: 'user-1',
  maxTokens: 100_000,
  runId: 'run-1',
};
const ANSWER = {
  entities: [
    {
      key: 'e1',
      title: 'Wdrożenie',
      type: 'PROCESS',
      description: 'Jak zaczyna nowa osoba.',
    },
  ],
  claims: [
    {
      entityKey: 'e1',
      statement: 'Dostęp jest nadawany pierwszego dnia.',
      quote:
        'Nowy pracownik otrzymuje dostęp do systemów w pierwszym dniu pracy.',
      locator: '§2',
    },
  ],
  relations: [],
};
const USAGE = { inputTokens: 300, outputTokens: 200 };

beforeEach(() => {
  vi.clearAllMocks();
  brainDb.getExtractionSource.mockResolvedValue({
    fileName: 'regulamin.pdf',
    language: 'pol',
    documentVersionId: '1c9f8b3d-2e4a-4f6b-8c7d-8e9f0a1b2c3d',
    text: TEXT,
  });
  brainDb.replaceCandidatesFromFile.mockResolvedValue({
    pagesCreated: 1,
    pagesReplaced: 0,
  });
  generateObject.mockResolvedValue({ object: ANSWER, usage: USAGE });
});

describe('extractDocumentCandidates', () => {
  it('writes the verified candidates, pinned to the active version', async () => {
    const result = await extractDocumentCandidates(INPUT);
    expect(result).toEqual({
      status: 'extracted',
      pagesCreated: 1,
      unverifiedClaims: 0,
      tokens: 500,
    });
    const [written] = brainDb.replaceCandidatesFromFile.mock.calls[0]!;
    expect(written.pages[0]).toMatchObject({
      slug: 'wdrozenie',
      accessibleBy: ['team:hr'],
      sources: [
        expect.objectContaining({
          documentVersionId: '1c9f8b3d-2e4a-4f6b-8c7d-8e9f0a1b2c3d',
          span: '§2',
        }),
      ],
    });
  });

  // Unbounded, Gemini's thinking ate the output cap and truncated the JSON:
  // 12 of 26 eval extractions failed that way.
  it('bounds the thinking a Gemini model may spend, under both namespaces', async () => {
    await extractDocumentCandidates(INPUT);
    const call = generateObject.mock.calls[0]![0];
    expect(call.providerOptions).toEqual({
      google: { thinkingConfig: { thinkingBudget: 2048 } },
      vertex: { thinkingConfig: { thinkingBudget: 2048 } },
    });
    expect(call.maxOutputTokens).toBe(16_000);
    // A 429 needs longer than the SDK's default two retries give it.
    expect(call.maxRetries).toBe(4);
  });

  it('names the document language to the model', async () => {
    await extractDocumentCandidates(INPUT);
    expect(generateObject.mock.calls[0]![0].prompt).toContain(
      'Language: Polish.',
    );
  });

  // D3: retrying a document resolves its finding on success.
  it('resolves the document open failure finding on success', async () => {
    await extractDocumentCandidates(INPUT);
    expect(brainDb.resolveExtractionFailed).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: INPUT.fileId,
    });
  });

  it('records the tokens it spent against the organization', async () => {
    await extractDocumentCandidates(INPUT);
    expect(trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        inputTokens: 300,
        outputTokens: 200,
        metadata: expect.objectContaining({ kind: 'brain_extract' }),
      }),
    );
  });

  it('raises EXTRACTION_FAILED for a document with no parsed text, at no model cost', async () => {
    brainDb.getExtractionSource.mockResolvedValue(null);
    const result = await extractDocumentCandidates(INPUT);
    expect(result.status).toBe('failed');
    expect(generateObject).not.toHaveBeenCalled();
    expect(brainDb.recordExtractionFailed).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', fileId: INPUT.fileId }),
    );
  });

  // The SDK's schema refusal costs tokens too; they must reach the budget,
  // and the retry must run.
  it('charges a schema refusal and retries it', async () => {
    generateObject
      .mockRejectedValueOnce(
        new NoObjectGeneratedError({
          message: 'no object',
          text: TEXT,
          response: { id: 'r', timestamp: new Date(), modelId: 'm' },
          usage: {
            inputTokens: 300,
            outputTokens: 50,
            totalTokens: 350,
          } as never,
          finishReason: 'stop',
        } as never),
      )
      .mockResolvedValueOnce({ object: ANSWER, usage: USAGE });
    const result = await extractDocumentCandidates(INPUT);
    expect(result).toMatchObject({ status: 'extracted', tokens: 850 });
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it('tells the retry which fields the refused answer got wrong, not "(root)"', async () => {
    generateObject
      .mockRejectedValueOnce(
        new NoObjectGeneratedError({
          message: 'no object',
          // JSON, but claims is the wrong type.
          text: JSON.stringify({ entities: [], claims: 'none', relations: [] }),
          response: { id: 'r', timestamp: new Date(), modelId: 'm' },
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } as never,
          finishReason: 'stop',
        } as never),
      )
      .mockResolvedValueOnce({ object: ANSWER, usage: USAGE });
    await extractDocumentCandidates(INPUT);
    const retryPrompt = generateObject.mock.calls[1]![0].prompt as string;
    expect(retryPrompt).toContain('claims');
    expect(retryPrompt).not.toContain('(root)');
  });

  it('raises a finding carrying no document text when both attempts fail', async () => {
    generateObject.mockResolvedValue({
      object: { entities: TEXT },
      usage: USAGE,
    });
    const result = await extractDocumentCandidates(INPUT);
    expect(result.status).toBe('failed');
    const [{ detail }] = brainDb.recordExtractionFailed.mock.calls[0]!;
    expect(detail).toMatchObject({ windowIndex: 0, runId: 'run-1' });
    expect(JSON.stringify(detail)).not.toContain('Nowy pracownik');
    expect(brainDb.replaceCandidatesFromFile).not.toHaveBeenCalled();
  });

  it('fails the document, not the step, when the provider errors on both attempts', async () => {
    const providerError = Object.assign(new Error(`echo ${TEXT}`), {
      name: 'AI_APICallError',
    });
    generateObject.mockRejectedValue(providerError);
    const result = await extractDocumentCandidates(INPUT);
    // Two failed calls inside extractDocument become a failed document, not
    // a thrown step: the batch goes on.
    expect(result.status).toBe('failed');
    const [{ detail }] = brainDb.recordExtractionFailed.mock.calls[0]!;
    expect(detail.reason).toBe('the call failed (AI_APICallError)');
  });

  it('never hands the logger an error object', async () => {
    generateObject.mockRejectedValue(new Error(TEXT));
    await extractDocumentCandidates(INPUT);
    const calls = Object.values(logger).flatMap((fn) =>
      typeof fn === 'function' && 'mock' in fn
        ? (fn as { mock: { calls: unknown[][] } }).mock.calls
        : [],
    );
    for (const call of calls) {
      // An Error is caught wherever it sits, not only at the top: pino
      // serializes `{ err }` with its message, which carries the request —
      // the document. Plain JSON.stringify would print `{}` for it and pass.
      expect(findError(call)).toBeNull();
      expect(
        JSON.stringify(call, (_, v) =>
          v instanceof Error ? { message: v.message, stack: v.stack } : v,
        ),
      ).not.toContain('Nowy pracownik');
    }
  });

  it('treats an answer whose every claim failed its quote check as a failure, keeping earlier candidates', async () => {
    generateObject.mockResolvedValue({
      object: {
        ...ANSWER,
        claims: [
          { ...ANSWER.claims[0], quote: 'Tego zdania nie ma w dokumencie.' },
        ],
      },
      usage: USAGE,
    });
    const result = await extractDocumentCandidates(INPUT);
    expect(result.status).toBe('failed');
    // An earlier good run's candidates survive, and the failure stays open.
    expect(brainDb.replaceCandidatesFromFile).not.toHaveBeenCalled();
    expect(brainDb.resolveExtractionFailed).not.toHaveBeenCalled();
    expect(brainDb.recordExtractionFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          reason: expect.stringContaining('nothing usable'),
        }),
      }),
    );
  });

  it('still reads a document with genuinely nothing to extract as a success', async () => {
    generateObject.mockResolvedValue({
      object: { entities: [], claims: [], relations: [] },
      usage: USAGE,
    });
    brainDb.replaceCandidatesFromFile.mockResolvedValue({
      pagesCreated: 0,
      pagesReplaced: 0,
    });
    const result = await extractDocumentCandidates(INPUT);
    expect(result.status).toBe('extracted');
    expect(brainDb.recordExtractionFailed).not.toHaveBeenCalled();
  });

  it('returns budget_exhausted and writes nothing when no tokens are left', async () => {
    const result = await extractDocumentCandidates({ ...INPUT, maxTokens: 0 });
    expect(result.status).toBe('budget_exhausted');
    expect(generateObject).not.toHaveBeenCalled();
    expect(brainDb.replaceCandidatesFromFile).not.toHaveBeenCalled();
    expect(brainDb.recordExtractionFailed).not.toHaveBeenCalled();
  });
});

/** The first Error anywhere inside a logger call's arguments, or null. */
function findError(value: unknown, seen = new Set<unknown>()): Error | null {
  if (value instanceof Error) {
    return value;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return null;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    const found = findError(child, seen);
    if (found) {
      return found;
    }
  }
  return null;
}

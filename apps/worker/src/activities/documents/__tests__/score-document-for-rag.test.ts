import {
  MAX_SUGGESTION_CHARS,
  normalizeRagScore,
  ragScoreResponseSchema,
  scoreDocumentForRag,
} from '../score-document-for-rag.js';

// `zodSchema` stays real: the point of these cases is what the schema handed
// to the model accepts. Only the call to the model is replaced.
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject: vi.fn(),
}));

vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn().mockResolvedValue('mock-model'),
}));

vi.mock('../../../services/langfuse-trace.js', () => ({
  withLangfuseTrace: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
}));

vi.mock('../../../services/db/db.js', () => ({
  db: { trackAiUsage: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { generateObject as generateObjectImpl } from 'ai';

const generateObject = vi.mocked(generateObjectImpl);

const long = 'Wprowadź numerowane nagłówki dla każdej sekcji cennika. '.repeat(
  8,
);

const answer = (suggestions: string[]) => ({
  chunkStructure: 1,
  avgChunkSize: 0,
  entityDensity: 10,
  selfContainedness: 7,
  qaAdherence: 0,
  total: 42.5,
  suggestions,
});

describe('ragScoreResponseSchema', () => {
  // The defect: one suggestion over 300 characters failed the whole object,
  // and `generateObject` threw a valid score away with it.
  it('accepts a suggestion longer than the stored limit', () => {
    expect(long.length).toBeGreaterThan(MAX_SUGGESTION_CHARS);
    expect(ragScoreResponseSchema.safeParse(answer([long])).success).toBe(true);
  });

  it('accepts more than five suggestions', () => {
    expect(
      ragScoreResponseSchema.safeParse(answer(Array(7).fill('x'))).success,
    ).toBe(true);
  });

  // The score itself stays strict: a dimension out of range is still wrong.
  it('still rejects a dimension out of range', () => {
    expect(
      ragScoreResponseSchema.safeParse({ ...answer([]), entityDensity: 11 })
        .success,
    ).toBe(false);
  });
});

describe('normalizeRagScore', () => {
  it('keeps the score and cuts each suggestion to the stored limit', () => {
    const score = normalizeRagScore(answer([long, 'Krótka.']));

    expect(score.total).toBe(42.5);
    expect(score.entityDensity).toBe(10);
    expect(score.suggestions[0].length).toBeLessThanOrEqual(
      MAX_SUGGESTION_CHARS,
    );
    expect(score.suggestions[0].endsWith('…')).toBe(true);
    expect(score.suggestions[1]).toBe('Krótka.');
  });

  it('keeps at most five, dropping blank ones', () => {
    const score = normalizeRagScore(
      answer(['a', '  ', 'b', 'c', 'd', 'e', 'f']),
    );
    expect(score.suggestions).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('scoreDocumentForRag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the model with the permissive schema, and stores the score', async () => {
    generateObject.mockResolvedValue({
      object: answer([long]),
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    } as never);

    const score = await scoreDocumentForRag({
      documentText: 'Cennik usług serwisowych.',
      orgId: 'org-1',
    });

    expect(score?.total).toBe(42.5);
    expect(score?.suggestions[0].length).toBeLessThanOrEqual(
      MAX_SUGGESTION_CHARS,
    );
    // The schema the model is held to accepts a long suggestion. Awaited:
    // `jsonSchema` is a promise, and stringifying the promise itself gives
    // "{}", which contains nothing and would pass any `not.toContain`.
    const { schema } = generateObject.mock.calls[0][0] as {
      schema: { jsonSchema: unknown };
    };
    const json = JSON.stringify(await schema.jsonSchema);
    expect(json).toContain('"suggestions"');
    expect(json).not.toContain('"maxLength":300');
  });

  it('states the limit in the prompt', async () => {
    generateObject.mockResolvedValue({
      object: answer([]),
      usage: {},
    } as never);

    await scoreDocumentForRag({ documentText: 'Tekst.', orgId: 'org-1' });

    const { system } = generateObject.mock.calls[0][0] as { system: string };
    expect(system).toContain('at most 300 characters');
  });

  it('still returns null when the call fails', async () => {
    generateObject.mockRejectedValue(new Error('provider down'));

    await expect(
      scoreDocumentForRag({ documentText: 'Tekst.', orgId: 'org-1' }),
    ).resolves.toBeNull();
  });
});

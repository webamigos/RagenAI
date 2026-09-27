import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the case that only became reachable when the document text stopped
 * riding in the job payload: the document can be deleted between enqueue and
 * run. `reindexDocumentVersion` refuses it; this had to as well.
 */

const getDocumentContent = vi.hoisted(() => vi.fn());
const updateOptimizationJobFields = vi.hoisted(() =>
  vi.fn(
    async (_args: {
      fields: { suggestions?: { after: string }[] };
    }): Promise<void> => undefined,
  ),
);

const trackAiUsage = vi.hoisted(() => vi.fn(async () => undefined));
const getOptimizationJobSuggestions = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../../../services/db/db.js', () => ({
  db: {
    getDocumentContent,
    updateOptimizationJobFields,
    trackAiUsage,
    getOptimizationJobSuggestions,
  },
}));

vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn(async () => ({ id: 'model' })),
}));
vi.mock('../../../services/langfuse-trace.js', () => ({
  withLangfuseTrace: vi.fn(async (_meta: unknown, fn: () => unknown) => fn()),
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('../evaluate-suggestion-dimensions.js', () => ({
  evaluateSuggestionDimensions: vi.fn(),
}));

const { optimizeDocumentSuggestions, translatesTheDocument } =
  await import('../optimize-document-suggestions.js');
const { generateObject } = await import('ai');
const { evaluateSuggestionDimensions } =
  await import('../evaluate-suggestion-dimensions.js');

const params = {
  jobId: 'job-1',
  documentId: 'doc-1',
  orgId: 'org-1',
};

beforeEach(() => vi.clearAllMocks());

describe('when the document has gone missing since the job was queued', () => {
  it('refuses non-retryably — a deleted document does not come back', async () => {
    getDocumentContent.mockResolvedValue(null);

    await expect(optimizeDocumentSuggestions(params)).rejects.toMatchObject({
      name: 'JobFailure',
      retryable: false,
    });
  });

  /**
   * Every write below the guard targets `user_documents.metadata` for this id,
   * so marking the job failed would write nowhere — and the job would read
   * `processing` for good. Refusing before anything is touched is the point.
   */
  it('does not mark the job processing on the way out', async () => {
    getDocumentContent.mockResolvedValue(null);

    await optimizeDocumentSuggestions(params).catch(() => undefined);

    expect(updateOptimizationJobFields).not.toHaveBeenCalled();
  });

  it('reads the document it was told to optimize', async () => {
    getDocumentContent.mockResolvedValue(null);

    await optimizeDocumentSuggestions(params).catch(() => undefined);

    expect(getDocumentContent).toHaveBeenCalledWith('doc-1', 'org-1');
  });
});

describe('when the document cannot be read, or has no text', () => {
  // The route has already written `pending`; each of these used to leave it
  // there, because the read ran before the activity's own failure boundary.
  it('marks the job failed when decryption throws, and rethrows that error', async () => {
    const decryptError = new Error('KMS refused to unwrap the key');
    getDocumentContent.mockRejectedValue(decryptError);

    await expect(optimizeDocumentSuggestions(params)).rejects.toBe(
      decryptError,
    );

    expect(updateOptimizationJobFields).toHaveBeenCalledTimes(1);
    expect(updateOptimizationJobFields.mock.calls[0][0]).toMatchObject({
      documentId: 'doc-1',
      orgId: 'org-1',
      fields: {
        id: 'job-1',
        status: 'failed',
        error: 'KMS refused to unwrap the key',
      },
    });
  });

  it('keeps the read error when marking the job failed fails too', async () => {
    const readError = new Error("Can't reach database server");
    getDocumentContent.mockRejectedValue(readError);
    updateOptimizationJobFields.mockRejectedValueOnce(
      new Error('write failed'),
    );

    await expect(optimizeDocumentSuggestions(params)).rejects.toBe(readError);
  });

  it('refuses whitespace non-retryably, marks it failed, and calls no model', async () => {
    getDocumentContent.mockResolvedValue({ content: '  \n\t \n', title: null });

    await expect(optimizeDocumentSuggestions(params)).rejects.toMatchObject({
      name: 'JobFailure',
      retryable: false,
    });

    expect(generateObject).not.toHaveBeenCalled();
    expect(updateOptimizationJobFields).toHaveBeenCalledTimes(1);
    expect(updateOptimizationJobFields.mock.calls[0][0].fields).toMatchObject({
      status: 'failed',
    });
  });
});

// B7, measured by A4: every English document came back part-Polish, because
// the prompt asked for "all text fields" in Polish. franc is real here — it is
// the thing under test.
const ENGLISH =
  'Tickets sold by partner operators are settled under those operators own terms and conditions.';
const POLISH =
  'Bilety sprzedawane przez operatorów partnerskich są rozliczane zgodnie z warunkami tych operatorów.';

describe('translatesTheDocument', () => {
  it('flags a replacement in another language than the text it replaces', async () => {
    await expect(translatesTheDocument(ENGLISH, POLISH, 'eng')).resolves.toBe(
      true,
    );
  });

  it('keeps a replacement in the same language', async () => {
    await expect(
      translatesTheDocument(
        ENGLISH,
        'Tickets sold by partner operators of Wolfsbane Interurban Rail are settled under the partner operators own terms.',
        'eng',
      ),
    ).resolves.toBe(false);
  });

  // A heading reads as any language; the document's own language decides.
  it('compares with the document when the replaced text is too short to tell', async () => {
    await expect(
      translatesTheDocument('## 1. Scope', POLISH, 'eng'),
    ).resolves.toBe(true);
  });

  it('keeps a replacement too short to tell', async () => {
    await expect(
      translatesTheDocument(ENGLISH, '## Zakres', 'eng'),
    ).resolves.toBe(false);
  });
});

describe('suggestions that translate the document', () => {
  it('are dropped before evaluation and never saved', async () => {
    const document = `# Refund policy\n\n${ENGLISH} ${ENGLISH}\n\nPassengers who cancel before departure are refunded sixty two percent of the fare.`;
    getDocumentContent.mockResolvedValue({
      content: document,
      title: 'Refunds',
    });
    vi.mocked(evaluateSuggestionDimensions).mockResolvedValue({} as never);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        suggestions: [
          {
            type: 'restructure',
            location: 'sekcja 1',
            before: ENGLISH,
            after: POLISH,
            rationale: 'Tłumaczenie.',
          },
          {
            type: 'keywords',
            location: 'sekcja 2',
            before:
              'Passengers who cancel before departure are refunded sixty two percent of the fare.',
            after:
              'Passengers of Wolfsbane Interurban Rail who cancel a ticket before departure are refunded sixty two percent of the fare.',
            rationale: 'Dodaje nazwę przewoźnika.',
          },
        ],
      },
      usage: {},
    } as never);

    await optimizeDocumentSuggestions(params);

    expect(evaluateSuggestionDimensions).toHaveBeenCalledTimes(1);
    const saved = updateOptimizationJobFields.mock.calls
      .map(([args]) => args.fields.suggestions)
      .find(Boolean)!;
    expect(saved).toHaveLength(1);
    expect(saved[0].after).toContain('Wolfsbane Interurban Rail');
  });

  it('asks for the document language in before and after', async () => {
    getDocumentContent.mockResolvedValue({
      content: `${ENGLISH} ${ENGLISH}`,
      title: null,
    });
    vi.mocked(generateObject).mockResolvedValue({
      object: { suggestions: [] },
      usage: {},
    } as never);

    await optimizeDocumentSuggestions(params).catch(() => undefined);

    const call = vi.mocked(generateObject).mock.calls[0][0] as {
      system: string;
      messages: { content: string }[];
    };
    expect(call.system).toContain('nigdy go nie tłumacz');
    expect(call.messages[0].content).not.toContain(
      'Wszystkie pola tekstowe wypełnij w języku polskim',
    );
  });
});

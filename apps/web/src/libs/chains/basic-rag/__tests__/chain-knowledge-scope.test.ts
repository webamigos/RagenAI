import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRetrieveKb,
  mockRetrieveThreadDocs,
  mockRephraseAndExpand,
  mockStreamText,
} = vi.hoisted(() => ({
  mockRetrieveKb: vi.fn(),
  mockRetrieveThreadDocs: vi.fn(),
  mockRephraseAndExpand: vi.fn(),
  mockStreamText: vi.fn(),
}));

// Mocked wholesale rather than spread over the real module: importing it for
// real pulls in the server logger, which webpack swaps at build time and
// vitest cannot resolve.
vi.mock('../operations', () => ({
  retrieveRelevantDocumentsWithIds: mockRetrieveKb,
  retrieveThreadDocuments: mockRetrieveThreadDocs,
  rephraseAndExpand: mockRephraseAndExpand,
  buildRagMessages: vi.fn(() => ({ system: 'sys', messages: [] })),
  validateAnswerGenerator: vi.fn(),
}));

vi.mock('@/libs/chains/utils/common-operations', () => ({
  sanitizeAndValidateInput: (input: unknown) => input,
  moderateContent: vi.fn(),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, streamText: mockStreamText };
});

import { basicRagChain } from '../chain';
import type { RagChainConfig } from '../../types/common';

const models = {
  contentModerator: {},
  questionRephraser: {},
  answerGenerator: {},
  embeddings: {},
} as never;

const run = async (config: Partial<RagChainConfig>) => {
  const chain = await basicRagChain({
    vectorStore: {} as never,
    models,
    config: config as RagChainConfig,
  });
  return chain.stream({
    question: 'Ile dni urlopu mi zostalo?',
    chat_history: [],
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRephraseAndExpand.mockResolvedValue({
    standaloneQuestion: 'Ile dni urlopu mi zostalo?',
    variants: ['urlop wymiar'],
  });
  mockRetrieveKb.mockResolvedValue({
    context: '<chunk file="regulamin.pdf">…</chunk>',
    sources: [{ fileId: 'f1', fileName: 'regulamin.pdf' }],
    chunkCount: 1,
    durationMs: 7,
  });
  mockRetrieveThreadDocs.mockResolvedValue('');
  mockStreamText.mockReturnValue({
    textStream: (async function* () {})(),
    text: Promise.resolve(''),
    fullStream: (async function* () {})(),
    reasoningText: Promise.resolve(undefined),
    usage: Promise.resolve({}),
  });
});

describe('the chain and the thread`s knowledge scope', () => {
  it('retrieves when the scope is absent, so an old caller is unchanged', async () => {
    await run({});

    expect(mockRetrieveKb).toHaveBeenCalledTimes(1);
  });

  it.each(['KNOWLEDGE_BASE', 'ASSISTANT'] as const)(
    'retrieves for %s — those two differ in the filter, not here',
    async (knowledgeScope) => {
      await run({ knowledgeScope });

      expect(mockRetrieveKb).toHaveBeenCalledTimes(1);
    },
  );

  it('does not touch the knowledge base for MODEL_ONLY', async () => {
    await run({ knowledgeScope: 'MODEL_ONLY' });

    expect(mockRetrieveKb).not.toHaveBeenCalled();
  });

  it('still retrieves thread documents for MODEL_ONLY', async () => {
    // The level means "no retrieval, anything needed is attached to the
    // message" — attachments are the point of it, not a casualty.
    await run({ knowledgeScope: 'MODEL_ONLY' });

    expect(mockRetrieveThreadDocs).toHaveBeenCalledTimes(1);
  });

  it('asks for no query variants when nothing will be searched', async () => {
    await run({
      knowledgeScope: 'MODEL_ONLY',
      ragSettings: {
        multiQueryEnabled: true,
        contentModerationEnabled: false,
        rerankingEnabled: true,
      },
    });

    expect(mockRephraseAndExpand).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false,
      undefined,
      undefined,
    );
  });

  describe('the MCP write-tool gate', () => {
    const gateOf = () =>
      mockStreamText.mock.calls[0][0].experimental_context.ragContextPresent;

    it('is open for MODEL_ONLY with nothing attached', async () => {
      // Nothing untrusted reached the model this turn, so there is nothing to
      // gate. Worth pinning: a security control changing state as a side
      // effect of "no retrieval" should be deliberate, not discovered.
      await run({ knowledgeScope: 'MODEL_ONLY' });

      expect(gateOf()).toBe(false);
    });

    it('closes for MODEL_ONLY once a document is attached', async () => {
      // The attachment's text goes into the same system prompt as a retrieved
      // chunk, and is the less vetted of the two. Checking only the
      // knowledge-base context left this open on the one level guaranteed to
      // have none.
      mockRetrieveThreadDocs.mockResolvedValue('<chunk>umowa najmu…</chunk>');

      await run({
        knowledgeScope: 'MODEL_ONLY',
        threadDocuments: [
          { name: 'umowa.pdf', content: 'x', size: 1, type: 'text/plain' },
        ] as never,
      });

      expect(gateOf()).toBe(true);
    });

    it('is not fooled by the empty-thread-documents marker', async () => {
      // With no documents `retrieveThreadDocuments` returns a non-empty
      // "no documents" string, so a bare `threadContext.trim()` would read as
      // context and pause every tool call for no reason.
      mockRetrieveThreadDocs.mockResolvedValue(
        '[Brak dokumentow watku - uzytkownik nie wgral zadnych plikow]',
      );

      await run({ knowledgeScope: 'MODEL_ONLY', threadDocuments: [] });

      expect(gateOf()).toBe(false);
    });
  });

  it('reports no retrieval at all for MODEL_ONLY, not an empty one', async () => {
    // `null` rather than `{ sources: [], chunkCount: 0 }`: "searched and found
    // nothing" is an answer about the knowledge base and "did not search" is
    // not, and the row above the answer says different things for each.
    const result = await run({ knowledgeScope: 'MODEL_ONLY' });

    await expect(result.retrieval).resolves.toBeNull();
  });

  it('summarises the retrieval it did do', async () => {
    mockRetrieveKb.mockResolvedValue({
      context: '<chunk file="regulamin.pdf">…</chunk>',
      sources: [{ fileId: 'f1', fileName: 'regulamin.pdf' }],
      chunkCount: 3,
      durationMs: 42,
    });

    const result = await run({});

    await expect(result.retrieval).resolves.toEqual({
      sources: [{ fileId: 'f1', fileName: 'regulamin.pdf' }],
      chunkCount: 3,
      durationMs: 42,
    });
  });
});

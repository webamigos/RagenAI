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

  it('leaves the MCP write-tool gate open for MODEL_ONLY', async () => {
    // `ragContextPresent` exists because retrieved document text is untrusted
    // input that could carry an exfiltration instruction. This turn retrieved
    // none, so the gate has nothing to gate — but it is worth a test, because
    // "no retrieval" quietly relaxing a security control is exactly the kind
    // of side effect that should be deliberate rather than discovered.
    await run({ knowledgeScope: 'MODEL_ONLY' });

    expect(
      mockStreamText.mock.calls[0][0].experimental_context.ragContextPresent,
    ).toBe(false);
  });

  it('reports no sources for MODEL_ONLY, rather than stale ones', async () => {
    const result = await run({ knowledgeScope: 'MODEL_ONLY' });

    await expect(result.retrievedSources).resolves.toEqual([]);
  });
});

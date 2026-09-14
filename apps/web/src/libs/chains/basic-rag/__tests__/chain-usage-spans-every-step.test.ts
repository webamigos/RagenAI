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

// Mocked wholesale for the same reason as chain-knowledge-scope.test.ts:
// importing `../operations` for real pulls in the server logger.
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

/**
 * The two fields differ only when the generation took more than one step, so
 * they are given deliberately different numbers here: whichever the chain
 * forwards is unambiguous in the assertion.
 */
const LAST_STEP_ONLY = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
const EVERY_STEP = { inputTokens: 900, outputTokens: 320, totalTokens: 1220 };

const models = {
  contentModerator: {},
  questionRephraser: {},
  answerGenerator: {},
  embeddings: {},
} as never;

const run = async (config: Partial<RagChainConfig> = {}) => {
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
    variants: [],
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
    // AI SDK 7 shapes: `usage` spans every step, `finalStep` carries the last
    // one on its own. On AI SDK 6 these were the other way round, which is the
    // bug this test was written for — see the doc comment below.
    usage: Promise.resolve(EVERY_STEP),
    finalStep: Promise.resolve({ usage: LAST_STEP_ONLY }),
  });
});

/**
 * What the chain forwards as `usage` is what ends up on the `AiUsage` row, and
 * those rows are what `checkUsageLimitsQuery` aggregates into the monthly cost
 * and token ceilings.
 *
 * On AI SDK 6 the SDK's `usage` was the **last step** only, and with
 * `stopWhen: stepCountIs(MAX_TOOL_STEPS)` a tool-calling turn has many — so
 * reading it billed a fraction of what the turn cost. AI SDK 7 redefined
 * `usage` to span every step, and moved the last-step value to
 * `finalStep.usage`. The assertion is unchanged in meaning and the number is
 * unchanged; only which field carries it moved.
 *
 * Every candidate is a `LanguageModelUsage` and all of them typecheck, which is
 * why this is asserted on the value rather than left to the type system.
 */
describe('the chain reports the tokens of every step, not just the last', () => {
  it('forwards the all-steps usage', async () => {
    const stream = await run();

    await expect(stream.usage).resolves.toEqual(EVERY_STEP);
  });

  it('does not forward the last step alone', async () => {
    const stream = await run();

    await expect(stream.usage).resolves.not.toEqual(LAST_STEP_ONLY);
  });
});

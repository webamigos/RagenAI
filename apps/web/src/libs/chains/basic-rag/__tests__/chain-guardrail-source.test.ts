import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which surface a guardrail hit is filed under.
 *
 * `initializeRagChain` is shared by four surfaces — the panel, the embedded
 * widget, a guest thread and the OpenAI-compatible route — and the chain
 * hardcoded `source: 'chat'` for all of them. That was invisible until C2:
 * the jailbreak classifier it absorbed was called *from the chatbot route*
 * and recorded `source: 'chatbot'`, so deleting that call without threading
 * the source through would have quietly refiled every widget hit as `chat`.
 *
 * A hit filed under the wrong surface is not lost, which is why nothing would
 * have failed. It is unfindable: an operator worried about what the public
 * widget is being sent filters `/incidents` by `chatbot` and sees nothing.
 */

const mockRunInputGuardrails = vi.fn();

vi.mock(
  '@/features/guardrails/services/queries/get-org-guardrails-query',
  () => ({
    getOrgGuardrailsQuery: vi
      .fn()
      .mockResolvedValue({
        input: [],
        output: [],
        degraded: false,
        dropped: [],
      }),
  }),
);

vi.mock(
  '@/features/guardrails/services/commands/run-input-guardrails-command',
  () => ({
    runInputGuardrailsCommand: (...a: unknown[]) => {
      mockRunInputGuardrails(...a);
      return Promise.resolve({ question: 'hello', chatHistory: '' });
    },
  }),
);

vi.mock('../operations', () => ({
  rephraseAndExpand: vi
    .fn()
    .mockResolvedValue({ standaloneQuestion: 'hello', variants: [] }),
  retrieveRelevantDocumentsWithIds: vi
    .fn()
    .mockResolvedValue({ context: '', fileIds: [] }),
  retrieveThreadDocuments: vi.fn().mockResolvedValue(''),
  buildRagMessages: vi.fn().mockReturnValue({ system: '', messages: [] }),
  validateAnswerGenerator: vi.fn(),
}));

vi.mock('ai', () => ({
  streamText: vi.fn().mockReturnValue({
    fullStream: (async function* () {})(),
    textStream: (async function* () {})(),
    usage: Promise.resolve({}),
  }),
  stepCountIs: vi.fn(),
}));

vi.mock('@/libs/mcp/client', () => ({ buildToolApprovalConfig: vi.fn() }));
vi.mock('../../utils/stream-mapper', () => ({
  mapFullStream: (s: unknown) => s,
}));

const { basicRagChain } = await import('../chain');

const streamWith = async (config: Record<string, unknown>) => {
  const chain = await basicRagChain({
    vectorStore: {} as never,
    models: {
      contentModerator: {} as never,
      answerGenerator: {} as never,
      questionRephraser: {} as never,
      embeddings: {} as never,
    },
    config: {
      tracking: { organizationId: 'org-1', userId: 'user-1' },
      ...config,
    } as never,
  });
  await chain.stream({ question: 'hello', chat_history: '' });
};

beforeEach(() => vi.clearAllMocks());

describe('the surface a guardrail hit is filed under', () => {
  it('is chat when the caller says nothing', async () => {
    // Every caller that predates the field is the panel, so the default has
    // to be the one they were already recording.
    await streamWith({});

    expect(mockRunInputGuardrails).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'chat' }),
    );
  });

  it('is whatever the caller passed', async () => {
    await streamWith({ guardrailSource: 'chatbot' });

    expect(mockRunInputGuardrails).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'chatbot' }),
    );
  });
});

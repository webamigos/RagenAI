import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A refused question must not reach a model — including the rephraser.
 *
 * The chain used to run the guardrail stage beside `rephraseAndExpand`
 * whenever no rule rewrote the text, on the reasoning that a verdict does not
 * change what moves on and so costs nothing to compute in parallel. It cost
 * the thing the feature is for: a question a `BLOCK` rule refuses had already
 * been sent to the rephraser, an external provider on most installations, by
 * the time the refusal was decided.
 *
 * `p0-29` asserted the turn "was refused before the chain reached a model"
 * and took the absence of the *answer* in the transcript as proof. The
 * rephraser leaves no trace in the transcript, so that assertion could not
 * see it. This one can.
 */

const { mockRephraseAndExpand, mockRetrieveKb, mockStreamText, mockRunInput } =
  vi.hoisted(() => ({
    mockRephraseAndExpand: vi.fn(),
    mockRetrieveKb: vi.fn(),
    mockStreamText: vi.fn(),
    mockRunInput: vi.fn(),
  }));

vi.mock('../operations', () => ({
  retrieveRelevantDocumentsWithIds: mockRetrieveKb,
  retrieveThreadDocuments: vi.fn(async () => ''),
  rephraseAndExpand: mockRephraseAndExpand,
  buildRagMessages: vi.fn(() => ({ system: 'sys', messages: [] })),
  validateAnswerGenerator: vi.fn(),
}));

vi.mock('@/libs/chains/utils/common-operations', () => ({
  sanitizeAndValidateInput: (input: unknown) => input,
  moderateContent: vi.fn(),
}));

vi.mock(
  '@/features/guardrails/services/queries/get-org-guardrails-query',
  () => ({
    getOrgGuardrailsQuery: vi.fn(async () => ({
      input: [{ publicId: 'rule-1', action: 'BLOCK' }],
      output: [],
      degraded: false,
      dropped: [],
    })),
  }),
);

vi.mock(
  '@/features/guardrails/services/commands/run-input-guardrails-command',
  () => ({ runInputGuardrailsCommand: mockRunInput }),
);

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, streamText: mockStreamText };
});

import { basicRagChain } from '../chain';
import { GuardrailError } from '@/libs/chains/errors';
import type { RagChainConfig } from '../../types/common';

const run = async () => {
  const chain = await basicRagChain({
    vectorStore: {} as never,
    models: {
      contentModerator: {},
      questionRephraser: {},
      answerGenerator: {},
      embeddings: {},
    } as never,
    config: {
      tracking: { organizationId: 'org-1', userId: 'user-1' },
    } as RagChainConfig,
  });
  return chain.stream({
    question: 'Pytanie objete regula',
    chat_history: [],
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRephraseAndExpand.mockResolvedValue({
    standaloneQuestion: 'Pytanie objete regula',
    variants: [],
  });
  mockRetrieveKb.mockResolvedValue({
    context: '',
    sources: [],
    chunkCount: 0,
    durationMs: 1,
  });
  mockStreamText.mockReturnValue({
    textStream: (async function* () {})(),
    text: Promise.resolve(''),
    fullStream: (async function* () {})(),
    reasoningText: Promise.resolve(undefined),
    usage: Promise.resolve({}),
  });
});

describe('a BLOCK rule stops the turn before any model call', () => {
  beforeEach(() => {
    mockRunInput.mockRejectedValue(new GuardrailError('rule-1', 'blocked'));
  });

  it('never calls the rephraser', async () => {
    await expect(run()).rejects.toBeInstanceOf(GuardrailError);

    expect(mockRephraseAndExpand).not.toHaveBeenCalled();
  });

  it('never reaches retrieval or the answer model either', async () => {
    await expect(run()).rejects.toBeInstanceOf(GuardrailError);

    expect(mockRetrieveKb).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('surfaces the guardrail error, not whatever else failed first', async () => {
    // The old concurrency also decided *which* error the reader got: whichever
    // promise rejected first won, so an unrouted rephraser model reported
    // `unknown-error` and the refusal never rendered. Sequencing makes the
    // guardrail the only thing that can reject here.
    mockRephraseAndExpand.mockRejectedValue(new Error('no route for model'));

    await expect(run()).rejects.toBeInstanceOf(GuardrailError);
  });
});

describe('a turn no rule refuses', () => {
  it('still rephrases, using the text the stage returned', async () => {
    // The guard on the guard: if sequencing had simply dropped the rephrase
    // call, every test above would pass and the chain would answer nothing.
    mockRunInput.mockResolvedValue({
      question: 'Pytanie po masce',
      chatHistory: '',
    });

    await run();

    expect(mockRephraseAndExpand).toHaveBeenCalledTimes(1);
    expect(mockRephraseAndExpand.mock.calls[0]?.[1]).toMatchObject({
      question: 'Pytanie po masce',
    });
  });
});

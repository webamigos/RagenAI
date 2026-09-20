/**
 * A refused question must not reach a model — including the rephraser.
 *
 * The same guard apps/web carries, on the same chain ported here in B4. Both
 * runtimes ran the guardrail stage beside `rephraseAndExpand` whenever no
 * rule rewrote the text, which meant a question a `BLOCK` rule refuses had
 * already been sent to the rephraser — an external provider on most
 * installations — by the time the refusal was decided.
 *
 * Duplicated rather than shared because the chains are two files by
 * deliberate choice (ADR-21), and a guard that lives in only one of them is
 * how the two drift back apart.
 */
const mockRephraseAndExpand = vi.fn();
const mockRetrieveKb = vi.fn();
const mockStreamText = vi.fn();

vi.mock('./operations.js', () => ({
  rephraseAndExpand: (...args: unknown[]) => mockRephraseAndExpand(...args),
  retrieveRelevantDocumentsWithIds: (...args: unknown[]) =>
    mockRetrieveKb(...args),
  retrieveThreadDocuments: () => Promise.resolve(''),
  buildRagMessages: () => ({ system: 'sys', messages: [] }),
  validateAnswerGenerator: () => undefined,
}));

vi.mock('../utils/common-operations/index.js', () => ({
  sanitizeAndValidateInput: (input: unknown) => input,
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    streamText: (...args: unknown[]) => mockStreamText(...args),
  };
});

import { basicRagChain } from './chain.js';

class Refused extends Error {}

const run = (runGuardrails: () => Promise<unknown>) =>
  basicRagChain({
    vectorStore: {},
    models: {
      questionRephraser: {},
      answerGenerator: {},
      embeddings: {},
    },
    config: {
      guardrails: { rules: [{ publicId: 'rule-1' }], run: runGuardrails },
      tracking: { organizationId: 'org-1' },
    },
  } as never).then((chain) =>
    chain.stream({
      question: 'Pytanie objete regula',
      chat_history: [],
    } as never),
  );

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

describe('a refusing input stage stops the turn before any model call', () => {
  const refuse = () => Promise.reject(new Refused('blocked'));

  it('never calls the rephraser', async () => {
    await expect(run(refuse)).rejects.toBeInstanceOf(Refused);

    expect(mockRephraseAndExpand).not.toHaveBeenCalled();
  });

  it('never reaches retrieval or the answer model either', async () => {
    await expect(run(refuse)).rejects.toBeInstanceOf(Refused);

    expect(mockRetrieveKb).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('surfaces the refusal, not whatever else failed first', async () => {
    // The concurrency also decided which error the reader got: whichever
    // promise rejected first won, so an unrouted rephraser reported an
    // unexpected error and the refusal never rendered.
    mockRephraseAndExpand.mockRejectedValue(new Error('no route for model'));

    await expect(run(refuse)).rejects.toBeInstanceOf(Refused);
  });
});

describe('a turn no rule refuses', () => {
  it('still rephrases, using the text the stage returned', async () => {
    // The guard on the guard: dropping the rephrase call outright would make
    // every assertion above pass and the chain answer nothing.
    await run(() =>
      Promise.resolve({ question: 'Pytanie po masce', chatHistory: '' }),
    );

    expect(mockRephraseAndExpand).toHaveBeenCalledTimes(1);
    expect(mockRephraseAndExpand.mock.calls[0]?.[1]).toMatchObject({
      question: 'Pytanie po masce',
    });
  });
});

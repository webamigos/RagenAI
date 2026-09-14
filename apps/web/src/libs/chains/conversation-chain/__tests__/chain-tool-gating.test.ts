import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStreamText } = vi.hoisted(() => ({ mockStreamText: vi.fn() }));

// Mocked wholesale rather than spread over the real module: importing it for
// real pulls in the server logger, which webpack swaps at build time and
// vitest cannot resolve.
vi.mock('../operations', () => ({
  buildConversationMessages: vi.fn(() => ({ system: 'sys', messages: [] })),
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

import { conversationChain } from '../chain';

const models = {
  contentModerator: {},
  answerGenerator: {},
} as never;

/** Tools have to be present, or the chain passes no gating context at all. */
const mcpTools = { gcal_create_event: { description: 'x' } };

const run = async (threadDocuments: unknown[]) => {
  const chain = await conversationChain({
    models,
    config: { mcpTools, threadDocuments } as never,
  });
  return chain.stream({ question: 'Co slychac?', chat_history: [] } as never);
};

const gateOf = () =>
  mockStreamText.mock.calls[0][0].runtimeContext.ragContextPresent;

beforeEach(() => {
  vi.clearAllMocks();
  mockStreamText.mockReturnValue({
    textStream: (async function* () {})(),
    fullStream: (async function* () {})(),
  });
});

/**
 * Conversation mode never retrieves, which is why the gate here used to be a
 * hardcoded `false`. It does carry attachments, though — `formatThreadDocuments`
 * appends text documents to the system prompt and images go into the message —
 * and an attachment is user-supplied rather than org-curated, so it is the
 * *more* suspect of the two kinds of untrusted content the gate covers.
 */
describe('the conversation chain and the MCP write-tool gate', () => {
  it('is open for a plain chat with nothing attached', async () => {
    // Nothing untrusted reached the model, and the gate fails closed on a
    // missing context — so "no attachments" has to be stated, not omitted.
    await run([]);

    expect(gateOf()).toBe(false);
  });

  it('closes once a text document is attached', async () => {
    await run([
      { name: 'umowa.pdf', content: 'x', size: 1, type: 'text/plain' },
    ]);

    expect(gateOf()).toBe(true);
  });

  it('closes once an image is attached', async () => {
    await run([
      {
        name: 'zrzut.png',
        content: '',
        size: 1,
        type: 'image/png',
        imageData: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);

    expect(gateOf()).toBe(true);
  });
});

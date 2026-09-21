import type { MockedFunction } from 'vitest';
import type { FastMCP } from 'fastmcp';

import { chat } from '../../client/ragen-api-client.js';
import type { RagenSession } from '../../auth.js';
import { registerChatTool } from '../chat-tool.js';

vi.mock('../../client/ragen-api-client.js', () => ({
  chat: vi.fn(),
}));

const mockChat = chat as MockedFunction<typeof chat>;

type ExecuteArgs = {
  assistant_id?: string;
  message: string;
  context?: string;
  reasoning_effort?: 'low' | 'medium' | 'high';
};
type ExecuteFn = (
  args: ExecuteArgs,
  context: { session?: RagenSession },
) => Promise<string>;

function captureExecute(): ExecuteFn {
  let captured: ExecuteFn | undefined;
  const fakeServer = {
    addTool: (tool: { execute: ExecuteFn }) => {
      captured = tool.execute;
    },
  } as unknown as FastMCP<RagenSession>;

  registerChatTool(fakeServer);
  if (!captured) {
    throw new Error('registerChatTool did not call addTool');
  }
  return captured;
}

describe('ragen_chat tool', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  // The schema used to demand an assistant. With the key carrying a scope,
  // a knowledge-base key has no assistant to name and apps/api refuses the
  // request if one is named anyway — so "not provided" has to reach the
  // client as an absent field, not an empty one.
  it('passes no assistant when the caller names none', async () => {
    mockChat.mockResolvedValue({ ok: true, text: 'Hi there' });
    const execute = captureExecute();

    await execute(
      { message: 'Hello' },
      { session: { apiKey: 'Bearer sk-test.secret' } },
    );

    expect(mockChat).toHaveBeenCalledWith('Bearer sk-test.secret', {
      assistant_id: undefined,
      content: 'Hello',
      context: undefined,
      reasoning_effort: undefined,
    });
  });

  it('calls the API client with the session apiKey and mapped args', async () => {
    mockChat.mockResolvedValue({ ok: true, text: 'Hi there' });
    const execute = captureExecute();

    const result = await execute(
      {
        assistant_id: 'asst-1',
        message: 'Hello',
        context: 'page text',
        reasoning_effort: 'high',
      },
      { session: { apiKey: 'Bearer sk-test.secret' } },
    );

    expect(mockChat).toHaveBeenCalledWith('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      content: 'Hello',
      context: 'page text',
      reasoning_effort: 'high',
    });
    expect(JSON.parse(result)).toEqual({ success: true, text: 'Hi there' });
  });

  it('returns a success:false envelope when the API call fails', async () => {
    mockChat.mockResolvedValue({
      ok: false,
      status: 404,
      message: 'Assistant not found',
    });
    const execute = captureExecute();

    const result = await execute(
      { assistant_id: 'missing', message: 'Hello' },
      { session: { apiKey: 'Bearer sk-test.secret' } },
    );

    expect(JSON.parse(result)).toEqual({
      success: false,
      status: 404,
      error: 'Assistant not found',
    });
  });

  it('returns an error envelope instead of throwing when session is missing', async () => {
    const execute = captureExecute();

    const result = await execute(
      { assistant_id: 'asst-1', message: 'Hello' },
      { session: undefined },
    );

    expect(mockChat).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toMatchObject({ success: false });
  });
});

import type { FastMCP } from 'fastmcp';

import { chat } from '../../client/ragen-api-client.js';
import type { RagenSession } from '../../auth.js';
import { registerChatTool } from '../chat-tool.js';

jest.mock('../../client/ragen-api-client.js', () => ({
  chat: jest.fn(),
}));

const mockChat = chat as jest.MockedFunction<typeof chat>;

type ExecuteArgs = {
  assistant_id: string;
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

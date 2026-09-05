import type { FastMCP } from 'fastmcp';

import { listAssistants } from '../../client/ragen-api-client.js';
import type { RagenSession } from '../../auth.js';
import { registerListAssistantsTool } from '../list-assistants-tool.js';

jest.mock('../../client/ragen-api-client.js', () => ({
  listAssistants: jest.fn(),
}));

const mockListAssistants = listAssistants as jest.MockedFunction<
  typeof listAssistants
>;

type ExecuteFn = (
  args: Record<string, never>,
  context: { session?: RagenSession },
) => Promise<string>;

function captureExecute(): ExecuteFn {
  let captured: ExecuteFn | undefined;
  const fakeServer = {
    addTool: (tool: { execute: ExecuteFn }) => {
      captured = tool.execute;
    },
  } as unknown as FastMCP<RagenSession>;

  registerListAssistantsTool(fakeServer);
  if (!captured) {
    throw new Error('registerListAssistantsTool did not call addTool');
  }
  return captured;
}

describe('ragen_list_assistants tool', () => {
  beforeEach(() => {
    mockListAssistants.mockReset();
  });

  it('calls the API client with the session apiKey and returns the assistant list', async () => {
    mockListAssistants.mockResolvedValue({
      ok: true,
      assistants: [{ id: 'asst-1', name: 'Support Bot' }],
    });
    const execute = captureExecute();

    const result = await execute(
      {},
      { session: { apiKey: 'Bearer sk-test.secret' } },
    );

    expect(mockListAssistants).toHaveBeenCalledWith('Bearer sk-test.secret');
    expect(JSON.parse(result)).toEqual({
      success: true,
      assistants: [{ id: 'asst-1', name: 'Support Bot' }],
    });
  });

  it('returns a success:false envelope when the API call fails', async () => {
    mockListAssistants.mockResolvedValue({
      ok: false,
      status: 401,
      message: 'Invalid API key',
    });
    const execute = captureExecute();

    const result = await execute(
      {},
      { session: { apiKey: 'Bearer sk-bad.secret' } },
    );

    expect(JSON.parse(result)).toEqual({
      success: false,
      status: 401,
      error: 'Invalid API key',
    });
  });

  it('returns an error envelope instead of throwing when session is missing', async () => {
    const execute = captureExecute();

    const result = await execute({}, { session: undefined });

    expect(mockListAssistants).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toMatchObject({ success: false });
  });
});

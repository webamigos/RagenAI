import type { FastMCP } from 'fastmcp';

import { searchKnowledgeBase } from '../../client/ragen-api-client.js';
import type { RagenSession } from '../../auth.js';
import { registerSearchKnowledgeBaseTool } from '../search-knowledge-base-tool.js';

jest.mock('../../client/ragen-api-client.js', () => ({
  searchKnowledgeBase: jest.fn(),
}));

const mockSearchKnowledgeBase = searchKnowledgeBase as jest.MockedFunction<
  typeof searchKnowledgeBase
>;

type ExecuteArgs = {
  assistant_id: string;
  query: string;
  max_results?: number;
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

  registerSearchKnowledgeBaseTool(fakeServer);
  if (!captured) {
    throw new Error('registerSearchKnowledgeBaseTool did not call addTool');
  }
  return captured;
}

describe('ragen_search_knowledge_base tool', () => {
  beforeEach(() => {
    mockSearchKnowledgeBase.mockReset();
  });

  it('calls the API client with the session apiKey and mapped args', async () => {
    mockSearchKnowledgeBase.mockResolvedValue({
      ok: true,
      context: '<chunk file="policy.md">Refunds within 30 days.</chunk>',
      fileIds: ['file-1'],
    });
    const execute = captureExecute();

    const result = await execute(
      {
        assistant_id: 'asst-1',
        query: 'refund policy',
        max_results: 3,
      },
      { session: { apiKey: 'Bearer sk-test.secret' } },
    );

    expect(mockSearchKnowledgeBase).toHaveBeenCalledWith(
      'Bearer sk-test.secret',
      { assistant_id: 'asst-1', query: 'refund policy', max_results: 3 },
    );
    expect(JSON.parse(result)).toEqual({
      success: true,
      context: '<chunk file="policy.md">Refunds within 30 days.</chunk>',
      file_ids: ['file-1'],
    });
  });

  it('returns a success:false envelope when the API call fails', async () => {
    mockSearchKnowledgeBase.mockResolvedValue({
      ok: false,
      status: 404,
      message: 'Assistant not found',
    });
    const execute = captureExecute();

    const result = await execute(
      { assistant_id: 'missing', query: 'refund policy' },
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
      { assistant_id: 'asst-1', query: 'refund policy' },
      { session: undefined },
    );

    expect(mockSearchKnowledgeBase).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toMatchObject({ success: false });
  });
});

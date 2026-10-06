import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createPortProbe } from 'node:net';
import { FastMCP } from 'fastmcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { serverOptions } from '../server-options.js';
import { httpStreamOptions } from '../transport.js';
import { resetEnvCache } from '../config/env.js';
import { type RagenSession } from '../auth.js';
import { registerChatTool } from '../tools/chat-tool.js';
import { registerListAssistantsTool } from '../tools/list-assistants-tool.js';
import { registerSearchKnowledgeBaseTool } from '../tools/search-knowledge-base-tool.js';
async function listen(server: Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('No port');
      }
      resolve(address.port);
    }),
  );
}
async function freePort(): Promise<number> {
  const server = createPortProbe();
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('No port');
      }
      server.close(() => resolve(address.port));
    }),
  );
}
it('runs all three tools stateless and takes each call identity from its current request', async () => {
  const calls: { path: string; credential?: string }[] = [];
  const api = createHttpServer((request, response) => {
    calls.push({
      path: request.url!,
      credential: request.headers.authorization,
    });
    request.resume();
    response.setHeader('content-type', 'application/json');
    const responses: Record<string, unknown> = {
      '/v1/chat': { text: 'Hello' },
      '/v1/search': { context: 'Known', file_ids: ['file-a'] },
      '/v1/assistants': { data: [{ id: 'asst-a', name: 'Assistant' }] },
    };
    const body = responses[request.url ?? ''];
    response.statusCode = body ? 200 : 404;
    response.end(JSON.stringify(body ?? { error: 'Unknown route' }));
  });
  const port = await listen(api);
  vi.stubEnv('TARGET_ENV', 'local');
  vi.stubEnv('RAGEN_API_URL', `http://127.0.0.1:${port}`);
  resetEnvCache();
  const mcp = new FastMCP<RagenSession>(
    serverOptions({ SERVER_VERSION: 'test' }),
  );
  registerChatTool(mcp);
  registerListAssistantsTool(mcp);
  registerSearchKnowledgeBaseTool(mcp);
  const client = new Client({ name: 'stateless-test', version: '1.0.0' });
  const headers = { Authorization: 'Bearer sk-first.secret' };
  try {
    const mcpPort = await freePort();
    await mcp.start({
      transportType: 'httpStream',
      httpStream: httpStreamOptions(mcpPort, '127.0.0.1'),
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${mcpPort}/mcp`),
      { requestInit: { headers } },
    );
    await client.connect(transport);
    expect(transport.sessionId).toBeUndefined();
    expect(
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
    ).toEqual([
      'ragen_chat',
      'ragen_list_assistants',
      'ragen_search_knowledge_base',
    ]);
    for (const credential of [
      'Bearer sk-first.secret',
      'Bearer sk-refreshed.secret',
    ]) {
      headers.Authorization = credential;
      for (const [name, args] of [
        ['ragen_chat', { message: 'Hello' }],
        ['ragen_search_knowledge_base', { query: 'Policy' }],
        ['ragen_list_assistants', {}],
      ] as const) {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).not.toBe(true);
      }
    }
    expect(calls.map((call) => call.path)).toEqual([
      '/v1/chat',
      '/v1/search',
      '/v1/assistants',
      '/v1/chat',
      '/v1/search',
      '/v1/assistants',
    ]);
    expect(calls.slice(0, 3).map((call) => call.credential)).toEqual(
      Array(3).fill('Bearer sk-first.secret'),
    );
    expect(calls.slice(3).map((call) => call.credential)).toEqual(
      Array(3).fill('Bearer sk-refreshed.secret'),
    );
  } finally {
    await client.close();
    await mcp.stop();
    await new Promise<void>((resolve, reject) =>
      api.close((error) => (error ? reject(error) : resolve())),
    );
    vi.unstubAllEnvs();
    resetEnvCache();
  }
}, 20_000);

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { FastMCP } from 'fastmcp';
import { z } from 'zod';

import type { RagenSession } from '../../auth.js';
import { mcpEnvSchema, resetEnvCache } from '../../config/env.js';
import { serverOptions } from '../../server-options.js';
import { registerChatTool } from '../../tools/chat-tool.js';
import { registerListAssistantsTool } from '../../tools/list-assistants-tool.js';
import { registerSearchKnowledgeBaseTool } from '../../tools/search-knowledge-base-tool.js';
import { sdkClient } from '../sdk-client.js';
import { runSmoke } from '../smoke.js';

/** Listens on a port the OS picks, so parallel suites cannot collide. */
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/**
 * The real MCP server, its real tools and the official client, with only the
 * Ragen API stubbed: the stub plays the deployment found on demo, where the
 * key was valid and every retrieval failed because the api had no vector
 * store. What this proves that the unit suite cannot is the wiring — the
 * header reaches the server, the SDK's tool result is read back as the
 * envelope, and a 500 from the API is reported as a failed retrieval step.
 */
describe('the smoke test against a running server', () => {
  const ORIGINAL_ENV = process.env;
  let api: Server | undefined;
  let mcp: FastMCP<RagenSession> | undefined;
  const authorizations: (string | undefined)[] = [];

  afterEach(async () => {
    await mcp?.stop();
    mcp = undefined;
    const server = api;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    api = undefined;
    process.env = ORIGINAL_ENV;
    resetEnvCache();
  });

  it('reports a working key and a failing retrieval as two layers', async () => {
    api = createServer((request, response) => {
      authorizations.push(request.headers.authorization);
      response.setHeader('content-type', 'application/json');
      if (request.url === '/v1/assistants') {
        response.end(
          JSON.stringify({ data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Support Bot' }] }),
        );
        return;
      }
      response.statusCode = 500;
      response.end(JSON.stringify({ message: 'Internal Server Error' }));
    });
    const apiPort = await listen(api);

    process.env = {
      ...ORIGINAL_ENV,
      TARGET_ENV: 'local',
      RAGEN_API_URL: `http://127.0.0.1:${apiPort}`,
    };
    resetEnvCache();

    const probe = createServer();
    const mcpPort = await listen(probe);
    await new Promise((resolve) => probe.close(resolve));

    mcp = new FastMCP<RagenSession>(
      serverOptions(mcpEnvSchema.parse({ TARGET_ENV: 'local' })),
    );
    registerChatTool(mcp);
    registerListAssistantsTool(mcp);
    registerSearchKnowledgeBaseTool(mcp);
    await mcp.start({
      transportType: 'httpStream',
      httpStream: { host: '127.0.0.1', port: mcpPort },
    });

    const results = await runSmoke(
      sdkClient(new URL(`http://127.0.0.1:${mcpPort}/mcp`), 'sk-test.secret'),
      { hasKey: true, query: 'refunds' },
    );

    expect(results.map((r) => [r.step, r.outcome])).toEqual([
      ['initialize', 'ok'],
      ['tools/list', 'ok'],
      ['ragen_list_assistants', 'ok'],
      ['ragen_search_knowledge_base', 'failed'],
    ]);
    expect(results[2]?.detail).toBe('1 assistant(s): Support Bot');
    expect(results[3]?.outcome === 'failed' && results[3].hint).toMatch(
      /QDRANT_URL/,
    );
    // The key went through the MCP server to the API unchanged.
    expect(authorizations).toContain('Bearer sk-test.secret');
  });

  // A tool that throws comes back as plain text with `isError`, not as its
  // JSON envelope. Read without the flag, that text looked like a version
  // mismatch between the server and this script.
  it('reports a tool that threw as a failure inside the MCP server', async () => {
    const probe = createServer();
    const mcpPort = await listen(probe);
    await new Promise((resolve) => probe.close(resolve));

    mcp = new FastMCP<RagenSession>(
      serverOptions(mcpEnvSchema.parse({ TARGET_ENV: 'local' })),
    );
    for (const name of [
      'ragen_chat',
      'ragen_list_assistants',
      'ragen_search_knowledge_base',
    ]) {
      mcp.addTool({
        name,
        description: name,
        parameters: z.object({}).passthrough(),
        execute: async () => {
          throw new Error('boom');
        },
      });
    }
    await mcp.start({
      transportType: 'httpStream',
      httpStream: { host: '127.0.0.1', port: mcpPort },
    });

    const results = await runSmoke(
      sdkClient(new URL(`http://127.0.0.1:${mcpPort}/mcp`), 'sk-test.secret'),
      { hasKey: true, query: 'refunds' },
    );
    const last = results.at(-1);

    expect(last).toMatchObject({
      step: 'ragen_list_assistants',
      outcome: 'failed',
    });
    expect(last?.detail).toContain('boom');
    expect(last?.outcome === 'failed' && last.hint).toMatch(
      /MCP server's logs/,
    );
  });
});

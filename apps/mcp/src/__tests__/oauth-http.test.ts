import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifyMcpServiceAssertion } from '@ragenai/crypto/mcp-service';
import { getEnv } from '../config/env.js';
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
it('verifies OAuth over HTTP and sends service assertions for the current token', async () => {
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
      '/v1/assistants': { data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Assistant' }] },
    };
    const body = responses[request.url ?? ''];
    response.statusCode = body ? 200 : 404;
    response.end(JSON.stringify(body ?? { error: 'Unknown route' }));
  });
  const port = await listen(api);
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  let jwksReads = 0;
  const jwk = await exportJWK(publicKey);
  const auth = createHttpServer((req, res) => {
    expect(req.url).toBe('/api/auth/jwks');
    jwksReads++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'one', alg: 'EdDSA' }] }));
  });
  const authPort = await listen(auth);
  const mcpPort = await freePort();
  const resource = `http://127.0.0.1:${mcpPort}/mcp`;
  const issuer = `http://127.0.0.1:${authPort}/api/auth`;
  const secret = 'test-mcp-service-secret'.repeat(2);
  vi.stubEnv('MCP_OAUTH_ENABLED', 'true');
  vi.stubEnv('MCP_SERVICE_SECRET', secret);
  vi.stubEnv('BETTER_AUTH_URL', `http://127.0.0.1:${authPort}`);
  vi.stubEnv('RAGEN_MCP_PUBLIC_URL', resource);
  const sign = (user: string, scope = 'mcp:read') =>
    new SignJWT({ org: 'org', client_id: 'client', scope })
      .setSubject(user)
      .setJti(user + '-jti')
      .setIssuer(issuer)
      .setAudience(resource)
      .setExpirationTime('15m')
      .setProtectedHeader({ alg: 'EdDSA', kid: 'one' })
      .sign(privateKey);
  const tokens = [await sign('first'), await sign('refreshed')];
  vi.stubEnv('TARGET_ENV', 'local');
  vi.stubEnv('RAGEN_API_URL', `http://127.0.0.1:${port}`);
  resetEnvCache();
  const mcp = new FastMCP<RagenSession>(serverOptions(getEnv()));
  registerChatTool(mcp);
  registerListAssistantsTool(mcp);
  registerSearchKnowledgeBaseTool(mcp);
  const client = new Client({ name: 'stateless-test', version: '1.0.0' });
  const headers = { Authorization: `Bearer ${tokens[0]}` };
  try {
    await mcp.start({
      transportType: 'httpStream',
      httpStream: httpStreamOptions(mcpPort, '127.0.0.1'),
    });
    const metadata = await fetch(
      `http://127.0.0.1:${mcpPort}/.well-known/oauth-protected-resource`,
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      resource,
      authorization_servers: [issuer],
      scopes_supported: ['mcp:read'],
    });
    for (const [token, status, error] of [
      [undefined, 401, undefined],
      ['invalid', 401, 'invalid_token'],
      [await sign('limited', 'openid'), 403, 'insufficient_scope'],
    ] as const) {
      const response = await fetch(resource, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: '{}',
      });
      expect(response.status).toBe(status);
      expect(response.headers.get('www-authenticate')).toContain(
        'resource_metadata=',
      );
      if (error)
        expect(response.headers.get('www-authenticate')).toContain(error);
    }
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
    for (const credential of [`Bearer ${tokens[0]}`, `Bearer ${tokens[1]}`]) {
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
    expect(jwksReads).toBe(1);
    for (const [index, call] of calls.entries()) {
      expect(call.credential).not.toContain(tokens[0]);
      expect(call.credential).not.toContain(tokens[1]);
      expect(
        verifyMcpServiceAssertion(call.credential!.slice(7), secret),
      ).toMatchObject({
        userId: index < 3 ? 'first' : 'refreshed',
        orgId: 'org',
        clientId: 'client',
      });
    }
  } finally {
    await client.close();
    await mcp.stop();
    await new Promise<void>((resolve, reject) =>
      api.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve) => auth.close(() => resolve()));
    vi.unstubAllEnvs();
    resetEnvCache();
  }
}, 20_000);

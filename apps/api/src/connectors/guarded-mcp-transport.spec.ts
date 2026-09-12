import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMCPClient } from '@ai-sdk/mcp';
import {
  createGuardedMcpTransport,
  isBlockedAddressError,
} from './guarded-mcp-transport.js';
import { BlockedAddressError } from './guarded-fetch.js';

function stubLookup(address: string) {
  return ((_hostname: string, _options: unknown, callback: any) =>
    callback(null, [{ address, family: 4 }])) as any;
}

/** The smallest server that satisfies an MCP Streamable-HTTP handshake. */
function startFakeMcpServer() {
  const seenHeaders: Array<Record<string, unknown>> = [];
  let connections = 0;

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seenHeaders.push(req.headers);
      const message = JSON.parse(body);
      if (message.method === 'initialize') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'mcp-session-id': 'test-session',
        });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'fake-shop', version: '1.0.0' },
            },
          }),
        );
        return;
      }
      if (message.method === 'tools/list') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              tools: [
                {
                  name: 'list_orders',
                  description: 'List shop orders',
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
            },
          }),
        );
        return;
      }
      res.writeHead(202).end();
    });
  });
  server.on('connection', () => {
    connections += 1;
  });

  return {
    server,
    seenHeaders,
    get connections() {
      return connections;
    },
  };
}

describe('createGuardedMcpTransport', () => {
  let fake: ReturnType<typeof startFakeMcpServer>;
  let port: number;

  beforeEach(async () => {
    fake = startFakeMcpServer();
    await new Promise<void>((resolve) =>
      fake.server.listen(0, '127.0.0.1', resolve),
    );
    port = (fake.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()));
  });

  it('drives a full MCP handshake through the guarded dispatcher', async () => {
    // Guards the substitution itself: @ai-sdk/mcp's createMCPClient must be
    // able to drive @modelcontextprotocol/sdk's transport, and the custom
    // auth header must survive the swap. Policy stubbed permissive so a real
    // socket to the local fake server is allowed.
    const guarded = createGuardedMcpTransport(
      `http://shop.example.com:${port}/wc/mcp`,
      { 'X-MCP-API-Key': 'ck_123:cs_456' },
      {
        lookup: stubLookup('127.0.0.1'),
        isBlockedAddress: () => false,
        // The fake server speaks plain http; production URLs are https by
        // the time they reach here (`normalizeSiteUrl` enforces it).
        allowedProtocols: ['http:'],
      },
    );

    // createMCPClient can reject too, so the dispatcher is released from an
    // outer finally rather than after a successful construction.
    try {
      const client = await createMCPClient({ transport: guarded.transport });
      try {
        const tools = await client.tools();
        expect(Object.keys(tools)).toEqual(['list_orders']);
      } finally {
        await client.close();
      }
    } finally {
      await guarded.close();
    }

    expect(fake.seenHeaders.length).toBeGreaterThan(0);
    for (const headers of fake.seenHeaders) {
      expect(headers['x-mcp-api-key']).toBe('ck_123:cs_456');
    }
  });

  it('refuses the handshake when the shop hostname rebinds to loopback', async () => {
    const guarded = createGuardedMcpTransport(
      `http://shop.example.com:${port}/wc/mcp`,
      { 'X-MCP-API-Key': 'ck_123:cs_456' },
      { lookup: stubLookup('127.0.0.1'), allowedProtocols: ['http:'] },
    );

    let thrown: unknown;
    try {
      await createMCPClient({ transport: guarded.transport });
    } catch (error) {
      thrown = error;
    } finally {
      await guarded.close();
    }

    expect(thrown).toBeDefined();
    expect(isBlockedAddressError(thrown)).toBe(true);
    // Nothing reached the service sitting behind the private address.
    expect(fake.connections).toBe(0);
    expect(fake.seenHeaders).toHaveLength(0);
  });

  it('refuses the handshake when the shop hostname rebinds to cloud metadata', async () => {
    const guarded = createGuardedMcpTransport(
      'http://shop.example.com/wc/mcp',
      { 'X-MCP-API-Key': 'ck_123:cs_456' },
      { lookup: stubLookup('169.254.169.254'), allowedProtocols: ['http:'] },
    );

    let thrown: unknown;
    try {
      await createMCPClient({ transport: guarded.transport });
    } catch (error) {
      thrown = error;
    } finally {
      await guarded.close();
    }

    // Assert the reason, not merely that something failed — an unrelated
    // error would otherwise satisfy this test.
    expect(isBlockedAddressError(thrown)).toBe(true);
  });
});

describe('isBlockedAddressError', () => {
  it('recognises the error directly', () => {
    expect(
      isBlockedAddressError(
        new BlockedAddressError('shop.example.com', '127.0.0.1'),
      ),
    ).toBe(true);
  });

  it('recognises it through the cause chain fetch wraps it in', () => {
    const wrapped = new TypeError('fetch failed', {
      cause: new Error('connect failed', {
        cause: new BlockedAddressError('shop.example.com', '10.0.0.1'),
      }),
    });

    expect(isBlockedAddressError(wrapped)).toBe(true);
  });

  it('recognises it after a wrapper flattened it to a plain Error', () => {
    // What a cross-realm wrapper leaves behind: the prototype is gone and
    // only String(error) survives.
    const flattened = new TypeError('fetch failed', {
      cause: new Error(
        'BlockedAddressError: Refusing to connect to shop.example.com: it resolves to the private or loopback address 127.0.0.1',
      ),
    });

    expect(isBlockedAddressError(flattened)).toBe(true);
  });

  it('recognises it by name when the prototype is gone', () => {
    const named = Object.assign(new Error('something else'), {
      name: 'BlockedAddressError',
    });

    expect(isBlockedAddressError(new TypeError('x', { cause: named }))).toBe(
      true,
    );
  });

  it('does not fire on an ordinary connection failure', () => {
    expect(
      isBlockedAddressError(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED',
          }),
        }),
      ),
    ).toBe(false);
  });

  it('survives a self-referencing cause chain', () => {
    const looping = new Error('boom') as Error & { cause?: unknown };
    looping.cause = looping;

    expect(isBlockedAddressError(looping)).toBe(false);
  });

  it.each([null, undefined, 'nope', 42])('is safe for %p', (value) => {
    expect(isBlockedAddressError(value)).toBe(false);
  });
});

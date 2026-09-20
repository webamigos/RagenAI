import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { probeMcpServer } from '../probe';

/**
 * The probe's contract is mostly about what it does when the endpoint does
 * *not* behave: an operator typing a URL into a form is exactly the case where
 * the address is wrong, the server is down, or it answers something that is
 * not MCP.
 */
const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function listen(handler: http.RequestListener): Promise<{ url: string }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/mcp` };
}

describe('probing an MCP endpoint', () => {
  it('refuses a URL that is not one, before opening anything', async () => {
    expect(await probeMcpServer('mcp.example.com')).toEqual({
      ok: false,
      reason: 'That is not a valid URL.',
    });
    expect(await probeMcpServer('file:///etc/passwd')).toEqual({
      ok: false,
      reason: 'The URL must be http:// or https://.',
    });
  });

  it('refuses an address the policy blocks, rather than dialling it', async () => {
    const result = await probeMcpServer('http://169.254.169.254/mcp', {
      allowPrivate: true,
    });

    expect(result.ok).toBe(false);
  });

  it('gives up on a server that never answers, without hanging', async () => {
    // The point of the deadline: an operator's request must not be held open
    // by an endpoint that simply does not reply.
    const { url } = await listen(() => {
      // Deliberately no response.
    });

    const started = Date.now();
    const result = await probeMcpServer(url, {
      isBlockedAddress: () => false,
      timeoutMs: 150,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'The server did not answer in time.',
    });
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('reports the reason when the endpoint is not an MCP server', async () => {
    const { url } = await listen((_request, response) => {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not here');
    });

    const result = await probeMcpServer(url, {
      isBlockedAddress: () => false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('stops when the caller cancels', async () => {
    const { url } = await listen(() => {});
    const controller = new AbortController();
    const result = probeMcpServer(url, {
      isBlockedAddress: () => false,
      signal: controller.signal,
    });
    controller.abort();

    expect(await result).toEqual({
      ok: false,
      reason: 'The check was cancelled.',
    });
  });
});

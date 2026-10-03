import { createServer } from 'node:net';

import { FastMCP } from 'fastmcp';

import type { RagenSession } from '../auth.js';
import { mcpEnvSchema } from '../config/env.js';
import { serverOptions } from '../server-options.js';

/** A port nothing is listening on, so parallel suites cannot collide. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('no port'));
        }
      });
    });
  });
}

/**
 * The initialize response's `serverInfo`, read off the wire from a running
 * server — not from the options object, because what a client sees is the
 * thing that was wrong (`0.0.1`, hardcoded, in every build).
 */
async function initialize(
  port: number,
): Promise<{ name: string; version: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer sk-test.secret',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'server-options.test', version: '0.0.0' },
      },
    }),
  });
  const body = await response.text();
  // The streamable HTTP transport may answer as JSON or as one SSE event.
  const json = body.trimStart().startsWith('{')
    ? body
    : (body
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice('data:'.length) ?? '');
  const message = JSON.parse(json) as {
    result: { serverInfo: { name: string; version: string } };
  };
  return message.result.serverInfo;
}

describe('serverOptions', () => {
  let server: FastMCP<RagenSession> | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  async function serverInfoFor(env: Record<string, string>) {
    const port = await freePort();
    server = new FastMCP<RagenSession>(
      serverOptions(mcpEnvSchema.parse({ TARGET_ENV: 'local', ...env })),
    );
    await server.start({
      transportType: 'httpStream',
      httpStream: { host: '127.0.0.1', port },
    });
    return initialize(port);
  }

  it('reports the release tag the image was built with as serverInfo.version', async () => {
    const serverInfo = await serverInfoFor({
      RAGEN_VERSION: '2.32.8',
      RAILWAY_GIT_COMMIT_SHA: 'abc123',
    });

    expect(serverInfo).toEqual({ name: 'Ragen', version: '2.32.8' });
  });

  it('reports the commit sha when the build named no release', async () => {
    const serverInfo = await serverInfoFor({
      RAILWAY_GIT_COMMIT_SHA: 'abc123',
    });

    expect(serverInfo.version).toBe('abc123');
  });

  it('never reports the old hardcoded placeholder', async () => {
    const serverInfo = await serverInfoFor({});

    expect(serverInfo.version).toBe('dev');
  });
});

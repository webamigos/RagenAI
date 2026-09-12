import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BlockedAddressError,
  createGuardedFetch,
  createGuardedLookup,
} from './guarded-fetch.js';

/**
 * Build a resolver stub standing in for DNS, so a "public" hostname can be
 * pointed at whatever the test needs — which is exactly what a DNS rebinding
 * attacker controls.
 */
function stubLookup(answers: Record<string, Array<[string, number]>>) {
  return jest.fn((hostname: string, _options: unknown, callback: any) => {
    const entry = answers[hostname];
    if (!entry) {
      callback(
        Object.assign(new Error(`no stub for ${hostname}`), {
          code: 'ENOTFOUND',
        }),
      );
      return;
    }
    callback(
      null,
      entry.map(([address, family]) => ({ address, family })),
    );
  }) as any;
}

function runLookup(
  lookup: any,
  hostname: string,
  options: Record<string, unknown>,
): Promise<{ error: Error | null; args: unknown[] }> {
  return new Promise((resolve) => {
    lookup(hostname, options, (error: Error | null, ...args: unknown[]) =>
      resolve({ error, args }),
    );
  });
}

describe('createGuardedLookup', () => {
  it('rejects a hostname that resolves to a loopback address (DNS rebinding)', async () => {
    const lookup = createGuardedLookup({
      lookup: stubLookup({ 'shop.example.com': [['127.0.0.1', 4]] }),
    });

    const { error } = await runLookup(lookup, 'shop.example.com', {
      all: true,
    });

    expect(error).toBeInstanceOf(BlockedAddressError);
    expect(error).toMatchObject({
      hostname: 'shop.example.com',
      address: '127.0.0.1',
    });
  });

  it.each([
    ['169.254.169.254', 4],
    ['10.0.0.5', 4],
    ['100.64.1.1', 4],
    ['::1', 6],
    ['fe80::1', 6],
  ] as Array<[string, number]>)(
    'rejects a rebind to %s',
    async (address, family) => {
      const lookup = createGuardedLookup({
        lookup: stubLookup({ 'shop.example.com': [[address, family]] }),
      });

      const { error } = await runLookup(lookup, 'shop.example.com', {
        all: true,
      });

      expect(error).toBeInstanceOf(BlockedAddressError);
    },
  );

  it('rejects the whole answer when only one address is private', async () => {
    // Node races candidates when autoSelectFamily is on, so filtering the
    // private one out would still leave it reachable. The batch must fail.
    const lookup = createGuardedLookup({
      lookup: stubLookup({
        'shop.example.com': [
          ['93.184.216.34', 4],
          ['127.0.0.1', 4],
        ],
      }),
    });

    const { error } = await runLookup(lookup, 'shop.example.com', {
      all: true,
    });

    expect(error).toBeInstanceOf(BlockedAddressError);
    expect(error).toMatchObject({ address: '127.0.0.1' });
  });

  it('passes public addresses through when the caller asked for all', async () => {
    const lookup = createGuardedLookup({
      lookup: stubLookup({
        'shop.example.com': [
          ['93.184.216.34', 4],
          ['2606:4700::1111', 6],
        ],
      }),
    });

    const { error, args } = await runLookup(lookup, 'shop.example.com', {
      all: true,
    });

    expect(error).toBeNull();
    expect(args[0]).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700::1111', family: 6 },
    ]);
  });

  it('answers in the single-address shape when the caller did not ask for all', async () => {
    const lookup = createGuardedLookup({
      lookup: stubLookup({
        'shop.example.com': [['93.184.216.34', 4]],
      }),
    });

    const { error, args } = await runLookup(lookup, 'shop.example.com', {
      family: 4,
    });

    expect(error).toBeNull();
    expect(args).toEqual(['93.184.216.34', 4]);
  });

  it('always resolves with all, so every candidate is inspected', async () => {
    const resolver = stubLookup({
      'shop.example.com': [['93.184.216.34', 4]],
    });
    const lookup = createGuardedLookup({ lookup: resolver });

    await runLookup(lookup, 'shop.example.com', { family: 4 });

    expect(resolver).toHaveBeenCalledWith(
      'shop.example.com',
      expect.objectContaining({ all: true, family: 4 }),
      expect.any(Function),
    );
  });

  it('propagates a resolver failure unchanged', async () => {
    const lookup = createGuardedLookup({ lookup: stubLookup({}) });

    const { error } = await runLookup(lookup, 'nope.example.com', {
      all: true,
    });

    expect(error).not.toBeInstanceOf(BlockedAddressError);
    expect(error).toMatchObject({ code: 'ENOTFOUND' });
  });

  it('fails an empty answer rather than connecting to nothing', async () => {
    const lookup = createGuardedLookup({
      lookup: stubLookup({ 'shop.example.com': [] }),
    });

    const { error } = await runLookup(lookup, 'shop.example.com', {
      all: true,
    });

    expect(error).toMatchObject({ code: 'ENOTFOUND' });
  });
});

describe('createGuardedFetch', () => {
  let server: http.Server;
  let port: number;
  let connections: number;
  // Registered rather than closed inline: an agent left open by a failing
  // assertion keeps sockets and can hang the run.
  let openGuards: Array<{ close: () => Promise<void> }>;

  function guardedFetch(options: Parameters<typeof createGuardedFetch>[0]) {
    const guarded = createGuardedFetch(options);
    openGuards.push(guarded);
    return guarded;
  }

  beforeEach(async () => {
    openGuards = [];
    connections = 0;
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('reached');
    });
    server.on('connection', () => {
      connections += 1;
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const guarded of openGuards) {
      await guarded.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('never opens a socket to a host that rebinds to loopback', async () => {
    const guarded = guardedFetch({
      lookup: stubLookup({ 'shop.example.com': [['127.0.0.1', 4]] }),
    });

    await expect(
      guarded.fetch(`http://shop.example.com:${port}/mcp`),
    ).rejects.toThrow();
    // The point of the guard: the request is stopped before connect, so the
    // service behind the private address is never touched.
    expect(connections).toBe(0);
  });

  it('connects to the address the guard vetted', async () => {
    // Policy stubbed permissive so a real socket to 127.0.0.1 is allowed —
    // this exercises the dispatcher/lookup/connect plumbing, not the policy
    // (covered above and in private-address.spec.ts).
    const guarded = guardedFetch({
      lookup: stubLookup({ 'shop.example.com': [['127.0.0.1', 4]] }),
      isBlockedAddress: () => false,
    });

    const response = await guarded.fetch(`http://shop.example.com:${port}/mcp`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('reached');
    expect(connections).toBe(1);
  });

  it('does not disturb the global dispatcher', async () => {
    // apps/api legitimately fetches localhost services (LiteLLM,
    // ragen-token-vault, apps/web's internal API), so the guard must stay
    // scoped to its own dispatcher.
    const guarded = guardedFetch({
      lookup: stubLookup({ 'shop.example.com': [['127.0.0.1', 4]] }),
    });

    await expect(
      guarded.fetch(`http://shop.example.com:${port}/`),
    ).rejects.toThrow();

    const direct = await fetch(`http://127.0.0.1:${port}/`);
    expect(direct.status).toBe(200);
    await direct.text();
  });
});

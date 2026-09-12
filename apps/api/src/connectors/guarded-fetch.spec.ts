import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BlockedAddressError,
  createGuardedConnector,
  createGuardedFetch,
  createGuardedLookup,
  InsecureProtocolError,
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
      allowedProtocols: ['http:'],
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
      allowedProtocols: ['http:'],
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
      allowedProtocols: ['http:'],
    });

    await expect(
      guarded.fetch(`http://shop.example.com:${port}/`),
    ).rejects.toThrow();

    const direct = await fetch(`http://127.0.0.1:${port}/`);
    expect(direct.status).toBe(200);
    await direct.text();
  });
});

/**
 * The `lookup` hook is not a guard on its own: `net.connect` calls it only for
 * a host it has to resolve, so an IP literal — the form a `Location` header
 * can hand you — reaches the socket without ever passing through it. These
 * tests exercise that gap through a real redirect.
 *
 * The "internal" server listens on `::1` so the blocked and the allowed hop
 * are genuinely different addresses: the stubbed policy blocks `::1` only,
 * which lets the first hop reach 127.0.0.1 while the redirect target stays
 * forbidden. Each case has a permissive twin, so a test that passes because
 * nothing was listening is not mistaken for a test that passes because the
 * guard worked.
 */
describe('createGuardedFetch through a redirect', () => {
  let shop: http.Server;
  let internal: http.Server;
  let shopPort: number;
  let internalPort: number;
  let internalConnections: number;
  let openGuards: Array<{ close: () => Promise<void> }>;

  function guardedFetch(options: Parameters<typeof createGuardedFetch>[0]) {
    const guarded = createGuardedFetch(options);
    openGuards.push(guarded);
    return guarded;
  }

  /** Blocks the internal address only, so the public first hop still connects. */
  const blocksInternalOnly = (address: string) => address === '::1';

  beforeEach(async () => {
    openGuards = [];
    internalConnections = 0;

    internal = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('internal service');
    });
    internal.on('connection', () => {
      internalConnections += 1;
    });
    await new Promise<void>((resolve) => internal.listen(0, '::1', resolve));
    internalPort = (internal.address() as AddressInfo).port;

    shop = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: `http://[::1]:${internalPort}/` });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('shop');
    });
    await new Promise<void>((resolve) => shop.listen(0, '127.0.0.1', resolve));
    shopPort = (shop.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const guarded of openGuards) {
      await guarded.close();
    }
    await new Promise<void>((resolve) => shop.close(() => resolve()));
    await new Promise<void>((resolve) => internal.close(() => resolve()));
  });

  it('never opens a socket to a private literal a redirect points at', async () => {
    const guarded = guardedFetch({
      lookup: stubLookup({ 'shop.example.com': [['127.0.0.1', 4]] }),
      isBlockedAddress: blocksInternalOnly,
      allowedProtocols: ['http:'],
    });

    await expect(
      guarded.fetch(`http://shop.example.com:${shopPort}/redirect`),
    ).rejects.toThrow();
    expect(internalConnections).toBe(0);
  });

  it('follows that same redirect when the policy permits the target', async () => {
    // The negative control's twin: proves the hop is reachable, so the
    // assertion above is the guard working and not the target being down.
    const guarded = guardedFetch({
      lookup: stubLookup({ 'shop.example.com': [['127.0.0.1', 4]] }),
      isBlockedAddress: () => false,
      allowedProtocols: ['http:'],
    });

    const response = await guarded.fetch(
      `http://shop.example.com:${shopPort}/redirect`,
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('internal service');
    expect(internalConnections).toBe(1);
  });

  it('never opens a socket to a private literal asked for directly', async () => {
    const guarded = guardedFetch({
      isBlockedAddress: blocksInternalOnly,
      allowedProtocols: ['http:'],
    });

    await expect(
      guarded.fetch(`http://[::1]:${internalPort}/`),
    ).rejects.toThrow();
    expect(internalConnections).toBe(0);
  });

  it('refuses plain http by default, before any socket', async () => {
    // No `allowedProtocols`: the shipped default is https only, so a
    // downgraded hop cannot put a connector's API-key header in clear text.
    const guarded = guardedFetch({
      lookup: stubLookup({ 'shop.example.com': [['127.0.0.1', 4]] }),
      isBlockedAddress: () => false,
    });

    await expect(
      guarded.fetch(`http://shop.example.com:${shopPort}/`),
    ).rejects.toThrow();
    expect(internalConnections).toBe(0);
  });
});

describe('createGuardedConnector', () => {
  function runConnect(
    connector: ReturnType<typeof createGuardedConnector>,
    options: { hostname: string; protocol?: string },
  ): Promise<Error | null> {
    return new Promise((resolve) => {
      connector(
        {
          hostname: options.hostname,
          host: options.hostname,
          protocol: options.protocol ?? 'https:',
          port: '443',
        },
        (error, socket) => {
          socket?.destroy();
          resolve(error);
        },
      );
    });
  }

  it.each([['127.0.0.1'], ['169.254.169.254'], ['[::1]'], ['[fe80::1]']])(
    'refuses the literal %s without consulting the resolver',
    async (hostname) => {
      const resolver = stubLookup({});
      const error = await runConnect(
        createGuardedConnector({ lookup: resolver }),
        { hostname },
      );

      expect(error).toBeInstanceOf(BlockedAddressError);
      expect(resolver).not.toHaveBeenCalled();
    },
  );

  it('refuses a scheme outside the allow-list', async () => {
    const error = await runConnect(createGuardedConnector(), {
      hostname: 'shop.example.com',
      protocol: 'http:',
    });

    expect(error).toBeInstanceOf(InsecureProtocolError);
    expect(error).toMatchObject({
      hostname: 'shop.example.com',
      protocol: 'http:',
    });
  });
});

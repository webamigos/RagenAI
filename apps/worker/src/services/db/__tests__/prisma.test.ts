/* eslint-disable no-var */
var constructed: number;
var adapters: { connectionString: string }[];
var extendedWith: unknown[];
var disconnected: number;
/* eslint-enable no-var */

// One level deeper than the module under test uses: vi.mock resolves
// relative to the file calling it, and this one sits in __tests__.
vi.mock('../../../../generated/prisma/index.js', () => {
  /**
   * A stand-in for the generated client. The real one would build a pg Pool,
   * and this test is about the wiring around it — how many clients get made,
   * what connection string reaches the adapter, and that the guard extension
   * is applied — none of which needs a database.
   */
  class FakePrismaClient {
    constructor() {
      constructed += 1;
    }
    $extends(extension: unknown) {
      extendedWith.push(extension);
      return this;
    }
    async $disconnect() {
      disconnected += 1;
    }
  }

  return {
    PrismaClient: FakePrismaClient,
    Prisma: {
      defineExtension: (definition: unknown) => () => definition,
    },
  };
});

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(config: { connectionString: string }) {
      adapters.push(config);
    }
  },
}));

vi.mock('../../logger.js', () => ({ logger: { warn: vi.fn() } }));

/**
 * A fresh copy of the module under test. `vi.resetModules()` in `beforeEach`
 * clears the registry; this re-imports it.
 *
 * Every caller must await it. Under jest this was a synchronous `require`, so
 * the destructuring below read the exports directly; the same line against a
 * promise silently yields `undefined` for each export rather than failing on
 * the import.
 */
async function loadPrismaModule(): Promise<typeof import('../prisma.js')> {
  return import('../prisma.js');
}

describe('the worker Prisma client', () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    constructed = 0;
    adapters = [];
    extendedWith = [];
    disconnected = 0;
    vi.resetModules();
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/ragen';
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  // Lazy is the point: a module-level client would open a pool the moment
  // anything in services/db is imported — including from a test that only
  // wanted a type, and from the workflow bundler.
  it('builds nothing until it is asked for', async () => {
    await loadPrismaModule();

    expect(constructed).toBe(0);
    expect(adapters).toEqual([]);
  });

  it('builds one client and reuses it', async () => {
    const { getPrisma } = await loadPrismaModule();

    const first = getPrisma();
    const second = getPrisma();

    expect(constructed).toBe(1);
    expect(second).toBe(first);
  });

  it('passes DATABASE_URL to the adapter', async () => {
    const { getPrisma } = await loadPrismaModule();

    getPrisma();

    expect(adapters).toEqual([
      { connectionString: 'postgresql://user:pass@localhost:5432/ragen' },
    ]);
  });

  it('applies exactly one extension — the tenant-scope guard', async () => {
    const { getPrisma } = await loadPrismaModule();

    getPrisma();

    expect(extendedWith).toHaveLength(1);
  });

  // The knex connection reads the same variable and fails at query time, which
  // is a worse place to find out about it.
  it('fails immediately when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    const { getPrisma } = await loadPrismaModule();

    expect(() => getPrisma()).toThrow(/DATABASE_URL is not set/);
    expect(constructed).toBe(0);
  });

  it('disconnects and lets a later call build a fresh client', async () => {
    const { getPrisma, disconnectPrisma } = await loadPrismaModule();

    getPrisma();
    await disconnectPrisma();

    expect(disconnected).toBe(1);

    getPrisma();

    expect(constructed).toBe(2);
  });

  it('disconnecting before anything was built is not an error', async () => {
    const { disconnectPrisma } = await loadPrismaModule();

    await expect(disconnectPrisma()).resolves.toBeUndefined();
    expect(disconnected).toBe(0);
  });
});

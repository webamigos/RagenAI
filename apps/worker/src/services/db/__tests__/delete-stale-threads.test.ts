// On Prisma since ADR-40 step 3c. The assertions are the ones the knex version
// carried, because they are about the *ordering* this function exists to get
// right, not about which query builder issues it: messages go before threads,
// the candidates are locked before anything is deleted, and the second
// staleness question — asked under the lock — is the one that decides.
//
// Three pieces stay in SQL and are mocked as such: the staleness aggregate
// (a LEFT JOIN with a HAVING over COALESCE(MAX(...))) and the FOR UPDATE lock,
// neither of which Prisma can express.

/* eslint-disable no-var */
var mockQueryRaw: jest.Mock;
var mockTransaction: jest.Mock;
var deletedFrom: string[];
var rawCalls: { sql: string; values: unknown[] }[];
/** Rows returned by successive $queryRaw calls, in order. */
var rawQueue: { id: string }[][];
var messageCount: number;
var threadCount: number;
/* eslint-enable no-var */

jest.mock('../prisma', () => {
  const flatten = (args: unknown[]): { sql: string; values: unknown[] } => {
    const [fragments, ...values] = args as [unknown, ...unknown[]];
    const strings = Array.isArray(fragments)
      ? (fragments as unknown[]).filter((f) => typeof f === 'string')
      : [];
    return { sql: strings.join(' ').replace(/\s+/g, ' ').trim(), values };
  };

  mockQueryRaw = jest.fn((...args: unknown[]) => {
    const call = flatten(args);
    rawCalls.push(call);
    if (/FOR UPDATE/.test(call.sql)) {
      deletedFrom.push('LOCK');
      return Promise.resolve([]);
    }
    return Promise.resolve(rawQueue.shift() ?? []);
  });

  const tx = {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    message: {
      deleteMany: jest.fn(() => {
        deletedFrom.push('messages');
        return Promise.resolve({ count: messageCount });
      }),
    },
    threadDocument: {
      deleteMany: jest.fn(() => {
        deletedFrom.push('thread_documents');
        return Promise.resolve({ count: 0 });
      }),
    },
    thread: {
      deleteMany: jest.fn(() => {
        deletedFrom.push('threads');
        return Promise.resolve({ count: threadCount });
      }),
    },
  };

  mockTransaction = jest.fn((fn: (t: typeof tx) => unknown) => fn(tx));

  return { getPrisma: () => ({ $transaction: mockTransaction }) };
});

jest.mock('knex', () => ({
  __esModule: true,
  default: jest.fn(() => {
    const noop = jest.fn();
    return Object.assign(noop, { raw: jest.fn(), transaction: jest.fn() });
  }),
}));

import { db } from '../db';

const CUTOFF = new Date('2026-09-01T00:00:00.000Z');
const twoStale = [{ id: 'thread-1' }, { id: 'thread-2' }];

beforeEach(() => {
  deletedFrom = [];
  rawCalls = [];
  rawQueue = [];
  messageCount = 7;
  threadCount = 2;
  mockQueryRaw.mockClear();
  mockTransaction.mockClear();
});

/** The lock query's SQL, or undefined if it never ran. */
function lockQuery() {
  return rawCalls.find((c) => /FOR UPDATE/.test(c.sql));
}

describe('deleteStaleThreads', () => {
  it('deletes messages before threads, so nothing is left orphaned', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    expect(deletedFrom).toEqual([
      'LOCK',
      'messages',
      'thread_documents',
      'threads',
    ]);
    expect(deletedFrom.indexOf('messages')).toBeLessThan(
      deletedFrom.indexOf('threads'),
    );
  });

  it('reports what it removed', async () => {
    rawQueue = [twoStale, twoStale];

    await expect(db.deleteStaleThreads('org-1', CUTOFF)).resolves.toEqual({
      threadsDeleted: 2,
      messagesDeleted: 7,
    });
  });

  it('touches nothing when no thread is stale', async () => {
    rawQueue = [[]];

    await expect(db.deleteStaleThreads('org-1', CUTOFF)).resolves.toEqual({
      threadsDeleted: 0,
      messagesDeleted: 0,
    });
    expect(deletedFrom).toEqual([]);
    expect(lockQuery()).toBeUndefined();
  });

  it('runs in one transaction, so a partial delete cannot orphan messages', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  // The point of the lock: inserting a message takes FOR KEY SHARE on the
  // thread row, which conflicts with FOR UPDATE, so a visitor cannot write
  // into a thread this transaction has already decided is abandoned.
  it('locks the candidates before deleting anything', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    const lock = lockQuery();
    expect(lock).toBeDefined();
    expect(lock?.values).toContain('org-1');
    expect(lock?.values).toContainEqual(['thread-1', 'thread-2']);
    expect(deletedFrom.indexOf('LOCK')).toBeLessThan(
      deletedFrom.indexOf('messages'),
    );
  });

  // Ordered by id so two concurrent runs cannot take the same rows in
  // opposite orders and deadlock.
  it('takes the lock in a deterministic order', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    expect(lockQuery()?.sql).toMatch(/ORDER BY id FOR UPDATE/);
  });

  it('spares a thread that stopped being stale while it was being locked', async () => {
    rawQueue = [twoStale, [{ id: 'thread-1' }]];
    threadCount = 1;

    const result = await db.deleteStaleThreads('org-1', CUTOFF);

    expect(result.threadsDeleted).toBe(1);
    expect(deletedFrom).toEqual([
      'LOCK',
      'messages',
      'thread_documents',
      'threads',
    ]);
  });

  it('deletes nothing when every candidate stopped being stale', async () => {
    rawQueue = [twoStale, []];

    await expect(db.deleteStaleThreads('org-1', CUTOFF)).resolves.toEqual({
      threadsDeleted: 0,
      messagesDeleted: 0,
    });
    expect(lockQuery()).toBeDefined();
    expect(deletedFrom).toEqual(['LOCK']);
  });

  // Thread is a tenant-scoped model, so every statement here names the org —
  // including the two that could have got away with filtering on ids alone.
  it('scopes every query to the organisation', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    for (const call of rawCalls) {
      expect(call.sql).toMatch(/organization_id/);
      expect(call.values).toContain('org-1');
    }
  });
});

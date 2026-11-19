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
var mockQueryRaw: Mock;
var mockTransaction: Mock;
var deletedFrom: string[];
var rawCalls: { sql: string; values: unknown[] }[];
/** Rows returned by successive $queryRaw calls, in order. */
var rawQueue: { id: string }[][];
var messageCount: number;
var threadCount: number;
var mockExecuteRaw: Mock;
var notificationDeletes: unknown[];
/* eslint-enable no-var */

vi.mock('../prisma.js', () => {
  // An optional clause is a nested `Prisma.sql` fragment passed as a value;
  // it is inlined here, text and values both, so an assertion sees the
  // statement that runs rather than a placeholder object.
  type Fragment = { strings: readonly string[]; values: readonly unknown[] };
  const isFragment = (value: unknown): value is Fragment =>
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Fragment).strings) &&
    Array.isArray((value as Fragment).values);
  const expand = (
    strings: readonly unknown[],
    values: readonly unknown[],
  ): { parts: string[]; values: unknown[] } => {
    const parts: string[] = [];
    const out: unknown[] = [];
    strings.forEach((part, index) => {
      if (typeof part === 'string') {
        parts.push(part);
      }
      if (index < values.length) {
        const value = values[index];
        if (isFragment(value)) {
          const nested = expand(value.strings, value.values);
          parts.push(...nested.parts);
          out.push(...nested.values);
        } else {
          out.push(value);
        }
      }
    });
    return { parts, values: out };
  };
  const flatten = (args: unknown[]): { sql: string; values: unknown[] } => {
    const [fragments, ...values] = args as [unknown, ...unknown[]];
    const { parts, values: flat } = expand(
      Array.isArray(fragments) ? (fragments as unknown[]) : [],
      values,
    );
    return { sql: parts.join(' ').replace(/\s+/g, ' ').trim(), values: flat };
  };

  mockQueryRaw = vi.fn((...args: unknown[]) => {
    const call = flatten(args);
    rawCalls.push(call);
    if (/FOR UPDATE/.test(call.sql)) {
      deletedFrom.push('LOCK');
      return Promise.resolve([]);
    }
    return Promise.resolve(rawQueue.shift() ?? []);
  });

  mockExecuteRaw = vi.fn((...args: unknown[]) => {
    const call = flatten(args);
    rawCalls.push(call);
    if (/visitor_messages/.test(call.sql)) {
      deletedFrom.push('visitor_messages');
    }
    return Promise.resolve(0);
  });

  const tx = {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    notification: {
      deleteMany: vi.fn((args: unknown) => {
        deletedFrom.push('notifications');
        notificationDeletes.push(args);
        return Promise.resolve({ count: 0 });
      }),
    },
    message: {
      deleteMany: vi.fn(() => {
        deletedFrom.push('messages');
        return Promise.resolve({ count: messageCount });
      }),
    },
    threadDocument: {
      deleteMany: vi.fn(() => {
        deletedFrom.push('thread_documents');
        return Promise.resolve({ count: 0 });
      }),
    },
    thread: {
      deleteMany: vi.fn(() => {
        deletedFrom.push('threads');
        return Promise.resolve({ count: threadCount });
      }),
    },
  };

  mockTransaction = vi.fn((fn: (t: typeof tx) => unknown) => fn(tx));

  return { getPrisma: () => ({ $transaction: mockTransaction }) };
});

import type { Mock } from 'vitest';
import { db } from '../db.js';

const CUTOFF = new Date('2026-09-01T00:00:00.000Z');
const twoStale = [{ id: 'thread-1' }, { id: 'thread-2' }];

beforeEach(() => {
  deletedFrom = [];
  rawCalls = [];
  rawQueue = [];
  messageCount = 7;
  threadCount = 2;
  notificationDeletes = [];
  mockQueryRaw.mockClear();
  mockExecuteRaw.mockClear();
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
      'visitor_messages',
      'messages',
      'thread_documents',
      'notifications',
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
      'visitor_messages',
      'messages',
      'thread_documents',
      'notifications',
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

/** The first staleness question — the one that picks candidates. */
function candidateQuery() {
  return rawCalls.find(
    (c) => /HAVING/.test(c.sql) && !c.values.some(Array.isArray),
  );
}

describe('deleteStaleThreads, the rows beyond the thread (retention, B4)', () => {
  // `visitor_messages.message_id` has no foreign key, so it can only be found
  // through the messages — which is why it goes before them — and through the
  // threads' organization, which is what scopes it.
  it('removes visitor_messages rows before the messages they name', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    const visitor = rawCalls.find((c) => /visitor_messages/.test(c.sql));
    expect(visitor?.sql).toMatch(/t\.organization_id =/);
    expect(visitor?.values).toContain('org-1');
    expect(visitor?.values).toContainEqual(['thread-1', 'thread-2']);
    expect(deletedFrom.indexOf('visitor_messages')).toBeLessThan(
      deletedFrom.indexOf('messages'),
    );
  });

  // The notification's body is the thread title and its link is the thread.
  it('removes the shared-thread notifications that point at the deleted threads', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    expect(notificationDeletes).toEqual([
      {
        where: {
          organizationId: 'org-1',
          type: 'THREAD_SHARED_NEW_MESSAGE',
          resourceUrl: { in: ['/threads/thread-1', '/threads/thread-2'] },
        },
      },
    ]);
  });
});

describe('deleteStaleThreads with a limit (retention batches, B4)', () => {
  it('limits the candidates, oldest activity first', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF, { limit: 100 });

    const candidates = candidateQuery();
    expect(candidates?.sql).toMatch(
      /ORDER BY COALESCE\(MAX\(m\.created_at\), t\.created_at\), t\.id LIMIT/,
    );
    expect(candidates?.values).toContain(100);
  });

  // The re-check under the lock is asked of the candidates only, so it needs
  // no limit — and must not carry one, or it could drop a locked candidate.
  it('asks the second question without a limit', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF, { limit: 100 });

    const recheck = rawCalls.find(
      (c) => /HAVING/.test(c.sql) && c.values.some(Array.isArray),
    );
    expect(recheck).toBeDefined();
    expect(recheck?.sql).not.toMatch(/LIMIT/);
  });

  it('takes every stale thread when no limit is given, as the demo cleanup does', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF);

    expect(candidateQuery()?.sql).not.toMatch(/LIMIT/);
  });

  // A thread's last activity is never before its creation, so a thread
  // created inside the window cannot be stale; filtering on it first keeps
  // the aggregate small without changing any answer.
  it('leaves threads created after the cutoff out of the aggregate', async () => {
    rawQueue = [twoStale, twoStale];

    await db.deleteStaleThreads('org-1', CUTOFF, { limit: 100 });

    expect(candidateQuery()?.sql).toMatch(/AND t\.created_at </);
    expect(candidateQuery()?.values).toContain(CUTOFF);
  });
});

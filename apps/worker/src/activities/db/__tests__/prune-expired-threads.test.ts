/**
 * The retention activity against an in-memory stand-in for the two db
 * functions it calls. The stand-in keeps the contract `deleteStaleThreads`
 * has with its callers — scoped to one organization, last activity strictly
 * before the cutoff, at most `limit` per call — so these tests are about
 * which organizations are pruned, with which cutoff, and how the batches
 * end. What goes with a thread (messages, citations, visitor rows,
 * notifications) is `delete-stale-threads.test.ts`'s subject.
 */

type FakeThread = {
  id: string;
  organizationId: string;
  lastActivity: Date;
  messages: number;
};

const store = vi.hoisted(() => ({
  threads: [] as FakeThread[],
  settings: [] as { organizationId: string; threadRetentionDays: number }[],
  deleteCalls: [] as {
    organizationId: string;
    staleBefore: Date;
    limit: number | undefined;
  }[],
  failFor: null as string | null,
}));

vi.mock('../../../services/db/index.js', () => ({
  db: {
    getThreadRetentionPolicies: vi.fn(async () => store.settings),
    deleteStaleThreads: vi.fn(
      async (
        organizationId: string,
        staleBefore: Date,
        options: { limit?: number } = {},
      ) => {
        store.deleteCalls.push({
          organizationId,
          staleBefore,
          limit: options.limit,
        });
        if (store.failFor === organizationId) {
          throw new Error('connection reset');
        }
        const expired = store.threads
          .filter(
            (thread) =>
              thread.organizationId === organizationId &&
              thread.lastActivity < staleBefore,
          )
          .slice(0, options.limit ?? Infinity);
        const ids = new Set(expired.map((thread) => thread.id));
        store.threads = store.threads.filter((thread) => !ids.has(thread.id));
        return {
          threadsDeleted: expired.length,
          messagesDeleted: expired.reduce((n, t) => n + t.messages, 0),
        };
      },
    ),
  },
}));

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../services/logger.js', () => ({ logger: log }));

import {
  THREAD_RETENTION_BATCH_SIZE,
  THREAD_RETENTION_MAX_BATCHES,
  pruneExpiredThreads,
} from '../prune-expired-threads.js';

const NOW = new Date('2026-10-19T04:30:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const thread = (
  id: string,
  organizationId: string,
  quietForDays: number,
  messages = 2,
): FakeThread => ({
  id,
  organizationId,
  lastActivity: daysAgo(quietForDays),
  messages,
});

const remaining = (organizationId: string) =>
  store.threads
    .filter((t) => t.organizationId === organizationId)
    .map((t) => t.id)
    .sort();

beforeEach(() => {
  store.threads = [];
  store.settings = [];
  store.deleteCalls = [];
  store.failFor = null;
  vi.clearAllMocks();
});

describe('pruneExpiredThreads', () => {
  it('deletes only the threads quiet for longer than the period', async () => {
    store.settings = [{ organizationId: 'org-a', threadRetentionDays: 30 }];
    store.threads = [
      thread('old', 'org-a', 31),
      thread('ancient', 'org-a', 400),
      thread('recent', 'org-a', 29),
      thread('today', 'org-a', 0),
    ];

    const result = await pruneExpiredThreads(NOW);

    expect(remaining('org-a')).toEqual(['recent', 'today']);
    expect(result).toMatchObject({
      organizationsWithRetention: 1,
      threadsDeleted: 2,
      messagesDeleted: 4,
      organizationsFailed: 0,
      organizationsCapped: 0,
    });
  });

  it('cuts exactly the period before now', async () => {
    store.settings = [{ organizationId: 'org-a', threadRetentionDays: 90 }];

    await pruneExpiredThreads(NOW);

    expect(store.deleteCalls[0]?.staleBefore).toEqual(daysAgo(90));
  });

  // Another organization's threads, however old, are not this one's to
  // delete — and an organization with retention off is never touched.
  it('leaves other organizations untouched, including one with retention off', async () => {
    store.settings = [{ organizationId: 'org-a', threadRetentionDays: 30 }];
    store.threads = [
      thread('a-old', 'org-a', 100),
      thread('b-old', 'org-b', 1000),
      thread('c-old', 'org-c', 1000),
    ];

    await pruneExpiredThreads(NOW);

    expect(remaining('org-a')).toEqual([]);
    expect(remaining('org-b')).toEqual(['b-old']);
    expect(remaining('org-c')).toEqual(['c-old']);
    expect(store.deleteCalls.map((c) => c.organizationId)).toEqual(
      Array(store.deleteCalls.length).fill('org-a'),
    );
  });

  it('deletes nothing when no organization has a period (the default)', async () => {
    store.threads = [thread('old', 'org-a', 1000)];

    const result = await pruneExpiredThreads(NOW);

    expect(store.deleteCalls).toEqual([]);
    expect(remaining('org-a')).toEqual(['old']);
    expect(result.threadsDeleted).toBe(0);
  });

  it('applies each organization its own period', async () => {
    store.settings = [
      { organizationId: 'org-a', threadRetentionDays: 30 },
      { organizationId: 'org-b', threadRetentionDays: 365 },
    ];
    store.threads = [
      thread('a-60', 'org-a', 60),
      thread('b-60', 'org-b', 60),
      thread('b-400', 'org-b', 400),
    ];

    await pruneExpiredThreads(NOW);

    expect(remaining('org-a')).toEqual([]);
    expect(remaining('org-b')).toEqual(['b-60']);
  });

  // Only a hand-edited row can hold one; guessing what `3` meant is how the
  // wrong conversations get deleted.
  it('skips a period that is not one of the presets, and says so', async () => {
    store.settings = [{ organizationId: 'org-a', threadRetentionDays: 3 }];
    store.threads = [thread('old', 'org-a', 10)];

    await pruneExpiredThreads(NOW);

    expect(store.deleteCalls).toEqual([]);
    expect(remaining('org-a')).toEqual(['old']);
    expect(log.warn).toHaveBeenCalledWith(
      { organizationId: 'org-a', threadRetentionDays: 3 },
      expect.stringContaining('not one of the presets'),
    );
  });

  describe('batches', () => {
    it('deletes in batches of the batch size until one comes back short', async () => {
      store.settings = [{ organizationId: 'org-a', threadRetentionDays: 30 }];
      store.threads = Array.from(
        { length: THREAD_RETENTION_BATCH_SIZE * 2 + 5 },
        (_, i) => thread(`t-${i}`, 'org-a', 60),
      );

      const result = await pruneExpiredThreads(NOW);

      expect(store.deleteCalls).toHaveLength(3);
      expect(
        store.deleteCalls.every((c) => c.limit === THREAD_RETENTION_BATCH_SIZE),
      ).toBe(true);
      expect(result.threadsDeleted).toBe(THREAD_RETENTION_BATCH_SIZE * 2 + 5);
      expect(remaining('org-a')).toEqual([]);
    });

    it('stops at the per-run ceiling and reports the organization as capped', async () => {
      store.settings = [{ organizationId: 'org-a', threadRetentionDays: 30 }];
      const total = THREAD_RETENTION_BATCH_SIZE * THREAD_RETENTION_MAX_BATCHES;
      store.threads = Array.from({ length: total + 1 }, (_, i) =>
        thread(`t-${i}`, 'org-a', 60),
      );

      const result = await pruneExpiredThreads(NOW);

      expect(store.deleteCalls).toHaveLength(THREAD_RETENTION_MAX_BATCHES);
      expect(result.threadsDeleted).toBe(total);
      expect(result.organizationsCapped).toBe(1);
      expect(remaining('org-a')).toHaveLength(1);
    });

    // Redelivery, a retry or tomorrow's run: what is gone stays gone and
    // what is left is finished off, with nothing deleted twice.
    it('is idempotent across runs', async () => {
      store.settings = [{ organizationId: 'org-a', threadRetentionDays: 30 }];
      store.threads = [thread('old', 'org-a', 60), thread('new', 'org-a', 1)];

      await pruneExpiredThreads(NOW);
      const second = await pruneExpiredThreads(NOW);

      expect(second.threadsDeleted).toBe(0);
      expect(remaining('org-a')).toEqual(['new']);
    });
  });

  it('carries on with the other organizations when one fails, then fails the run', async () => {
    store.settings = [
      { organizationId: 'org-a', threadRetentionDays: 30 },
      { organizationId: 'org-b', threadRetentionDays: 30 },
    ];
    store.threads = [
      thread('a-old', 'org-a', 60),
      thread('b-old', 'org-b', 60),
    ];
    store.failFor = 'org-a';

    await expect(pruneExpiredThreads(NOW)).rejects.toThrow(
      'Thread retention failed for 1 of 2 organizations',
    );
    expect(remaining('org-b')).toEqual([]);
    expect(remaining('org-a')).toEqual(['a-old']);
  });

  // Ids and counts only: a thread title is content.
  it('logs counts, not content', async () => {
    store.settings = [{ organizationId: 'org-a', threadRetentionDays: 30 }];
    store.threads = [thread('old', 'org-a', 60)];

    await pruneExpiredThreads(NOW);

    const logged = JSON.stringify(log.info.mock.calls);
    expect(logged).toContain('"threadsDeleted":1');
    expect(logged).not.toMatch(/title|content/i);
  });
});

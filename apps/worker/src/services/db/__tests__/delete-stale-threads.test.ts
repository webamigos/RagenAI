// Knex is initialized at module load, so the mocks are declared with `var`
// (JS-hoisted) to be reachable inside the jest.mock factory — same reason as
// pii-settings.test.ts.

/* eslint-disable no-var */
var mockConnection: jest.Mock & { transaction: jest.Mock; raw: jest.Mock };
var deletedFrom: string[];
var lockedIds: string[] | null;
/** Aggregate results, in call order: candidates first, then the re-check. */
var staleQueue: { id: string }[][];
/* eslint-enable no-var */

jest.mock('knex', () => {
  /**
   * A knex stand-in narrow enough to assert what matters: which tables are
   * deleted from and in what order, that the candidates are locked before
   * anything is deleted, and that the second staleness query decides.
   */
  const makeTrx = () => {
    const aggregate = () => ({
      leftJoin: () => ({
        groupBy: () => ({
          havingRaw: () => ({
            select: async () => staleQueue.shift() ?? [],
          }),
        }),
      }),
    });

    return ((table: string) => {
      if (table === 'threads as t') {
        return { where: aggregate, whereIn: aggregate };
      }
      if (table === 'threads') {
        return {
          whereIn: (_col: string, ids: string[]) => ({
            orderBy: () => ({
              forUpdate: () => ({
                select: async () => {
                  lockedIds = ids;
                  return ids.map((id) => ({ id }));
                },
              }),
            }),
            del: async () => {
              deletedFrom.push('threads');
              return ids.length;
            },
          }),
        };
      }
      return {
        whereIn: () => ({
          del: async () => {
            deletedFrom.push(table);
            return table === 'messages' ? 7 : 1;
          },
        }),
      };
    }) as unknown as jest.Mock;
  };

  mockConnection = jest.fn() as jest.Mock & {
    transaction: jest.Mock;
    raw: jest.Mock;
  };
  mockConnection.transaction = jest.fn(
    async (callback: (trx: unknown) => Promise<unknown>) => callback(makeTrx()),
  );
  mockConnection.raw = jest.fn();

  return { default: jest.fn(() => mockConnection), __esModule: true };
});

import { db } from '../db';

const TWO_STALE = [{ id: 'thread-1' }, { id: 'thread-2' }];

describe('deleteStaleThreads', () => {
  beforeEach(() => {
    deletedFrom = [];
    lockedIds = null;
    staleQueue = [TWO_STALE, TWO_STALE];
  });

  /**
   * The regression this guards is not hypothetical — it is what the spec
   * assumed. `messages_thread_id_fkey` is `ON DELETE SET NULL`, so deleting a
   * thread detaches its messages rather than removing them. They would survive
   * holding encrypted content while `threads.encrypted_dek`, the only key that
   * could read them, goes away with the thread.
   */
  it('deletes messages before threads, so nothing is left orphaned', async () => {
    await db.deleteStaleThreads('org-1', new Date('2026-09-01T00:00:00Z'));

    expect(deletedFrom).toEqual(['messages', 'thread_documents', 'threads']);
    expect(deletedFrom.indexOf('messages')).toBeLessThan(
      deletedFrom.indexOf('threads'),
    );
  });

  it('reports what it removed', async () => {
    const result = await db.deleteStaleThreads('org-1', new Date());

    expect(result).toEqual({ threadsDeleted: 2, messagesDeleted: 7 });
  });

  it('touches nothing when no thread is stale', async () => {
    staleQueue = [[], []];

    const result = await db.deleteStaleThreads('org-1', new Date());

    expect(result).toEqual({ threadsDeleted: 0, messagesDeleted: 0 });
    expect(deletedFrom).toEqual([]);
    expect(lockedIds).toBeNull();
  });

  it('runs in one transaction, so a partial delete cannot orphan messages', async () => {
    await db.deleteStaleThreads('org-1', new Date());

    expect(mockConnection.transaction).toHaveBeenCalledTimes(1);
  });

  it('locks the candidates before deleting anything', async () => {
    // Under READ COMMITTED the selection alone is not enough: a message can
    // land between choosing a thread and deleting it. FOR UPDATE conflicts
    // with the FOR KEY SHARE that a message insert takes on its thread, which
    // is what actually closes the window.
    await db.deleteStaleThreads('org-1', new Date());

    expect(lockedIds).toEqual(['thread-1', 'thread-2']);
  });

  it('spares a thread that stopped being stale while it was being locked', async () => {
    // Second aggregate is the one that decides: thread-2 received a message
    // between the two queries, so only thread-1 may go.
    staleQueue = [TWO_STALE, [{ id: 'thread-1' }]];

    const result = await db.deleteStaleThreads('org-1', new Date());

    expect(result.threadsDeleted).toBe(1);
    expect(deletedFrom).toEqual(['messages', 'thread_documents', 'threads']);
  });

  it('deletes nothing when every candidate stopped being stale', async () => {
    staleQueue = [TWO_STALE, []];

    const result = await db.deleteStaleThreads('org-1', new Date());

    expect(result).toEqual({ threadsDeleted: 0, messagesDeleted: 0 });
    expect(lockedIds).toEqual(['thread-1', 'thread-2']);
    expect(deletedFrom).toEqual([]);
  });
});

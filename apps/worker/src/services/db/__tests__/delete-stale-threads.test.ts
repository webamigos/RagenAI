// Knex is initialized at module load, so the mocks are declared with `var`
// (JS-hoisted) to be reachable inside the jest.mock factory — same reason as
// pii-settings.test.ts.

/* eslint-disable no-var */
var mockConnection: jest.Mock & { transaction: jest.Mock; raw: jest.Mock };
var deletedFrom: string[];
var staleRows: { id: string }[];
/* eslint-enable no-var */

jest.mock('knex', () => {
  /**
   * A knex stand-in narrow enough to assert the one property that matters:
   * which tables are deleted from, in what order.
   */
  const makeTrx = () => {
    const trx = ((table: string) => {
      if (table === 'threads as t') {
        return {
          leftJoin: () => ({
            where: () => ({
              groupBy: () => ({
                havingRaw: () => ({ select: async () => staleRows }),
              }),
            }),
          }),
        };
      }
      return {
        whereIn: () => ({
          del: async () => {
            deletedFrom.push(table);
            return table === 'messages' ? 7 : staleRows.length;
          },
        }),
      };
    }) as unknown as jest.Mock;
    return trx;
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

describe('deleteStaleThreads', () => {
  beforeEach(() => {
    deletedFrom = [];
    staleRows = [{ id: 'thread-1' }, { id: 'thread-2' }];
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
    staleRows = [];

    const result = await db.deleteStaleThreads('org-1', new Date());

    expect(result).toEqual({ threadsDeleted: 0, messagesDeleted: 0 });
    expect(deletedFrom).toEqual([]);
  });

  it('runs in one transaction, so a partial delete cannot orphan messages', async () => {
    await db.deleteStaleThreads('org-1', new Date());

    expect(mockConnection.transaction).toHaveBeenCalledTimes(1);
  });
});

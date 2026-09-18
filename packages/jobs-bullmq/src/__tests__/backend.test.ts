import { describe, expect, it, vi } from 'vitest';

import {
  backendFactoryFor,
  describeBackend,
  migrateQueueSchema,
  redisBackend,
  resolveQueueBackend,
} from '../backend.js';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/**
 * The module that decides which datastore the queues live in.
 *
 * It is worth its own suite because everything downstream takes its answer on
 * trust: the producer, the worker and the dashboard each construct from a
 * `QueueBackend` and none of them re-reads the environment. A wrong answer
 * here is a producer and a worker pointed at different datastores, which
 * presents as a worker that is merely slow.
 */
describe('resolveQueueBackend', () => {
  it('is Redis when nothing says otherwise, matching the seam default', () => {
    expect(
      resolveQueueBackend({ REDIS_URL: 'redis://localhost:6379' }),
    ).toEqual({ kind: 'redis', connection: { url: 'redis://localhost:6379' } });
  });

  it.each([['redis'], ['  redis  ']])('reads %s explicitly', (value) => {
    expect(
      resolveQueueBackend({
        BULLMQ_BACKEND: value,
        REDIS_URL: 'redis://localhost:6379',
      }).kind,
    ).toBe('redis');
  });

  it('reads postgres, with the database that is already there', () => {
    expect(
      resolveQueueBackend({
        BULLMQ_BACKEND: 'postgres',
        DATABASE_URL: 'postgresql://localhost:5432/ragen',
      }),
    ).toEqual({
      kind: 'postgres',
      connection: {
        connectionString: 'postgresql://localhost:5432/ragen',
        schema: 'bullmq',
      },
    });
  });

  it('takes a schema of its own when one is given', () => {
    const backend = resolveQueueBackend({
      BULLMQ_BACKEND: 'postgres',
      DATABASE_URL: 'postgresql://localhost:5432/ragen',
      BULLMQ_POSTGRES_SCHEMA: 'ragen_queues',
    });

    expect(backend.kind === 'postgres' && backend.connection.schema).toBe(
      'ragen_queues',
    );
  });

  /**
   * Not "unknown means Redis". A typo in one process's environment would then
   * send the producers to one datastore and the worker to another, and the
   * only symptom is jobs that are never consumed — which is indistinguishable
   * from a worker that is down.
   */
  it('refuses a backend it does not implement rather than falling back', () => {
    expect(() => resolveQueueBackend({ BULLMQ_BACKEND: 'mysql' })).toThrowError(
      /not a backend this build knows/,
    );
  });

  /**
   * The env schema requires this under `postgres`, so reaching it means a
   * process that skipped the schema — a test, a script, a container started
   * with a partial environment. Naming the variable beats `pg` reporting a
   * connection to an undefined host.
   */
  it('names DATABASE_URL when postgres is chosen without one', () => {
    expect(() =>
      resolveQueueBackend({ BULLMQ_BACKEND: 'postgres' }),
    ).toThrowError(/DATABASE_URL/);
  });
});

describe('backendFactoryFor', () => {
  /**
   * `undefined` rather than `createRedisBackend`, deliberately: the Redis path
   * stays the call BullMQ makes by default, so it keeps tracking whatever that
   * default becomes instead of pinning today's answer.
   */
  it('leaves Redis to BullMQ’s own default factory', () => {
    expect(
      backendFactoryFor(redisBackend('redis://localhost:6379')),
    ).toBeUndefined();
  });

  it('supplies a factory for postgres', () => {
    const backend = resolveQueueBackend({
      BULLMQ_BACKEND: 'postgres',
      DATABASE_URL: 'postgresql://localhost:5432/ragen',
    });

    expect(backendFactoryFor(backend)).toBeTypeOf('function');
  });
});

describe('migrateQueueSchema', () => {
  /**
   * The assertion that keeps a Redis install from paying for this: no pool is
   * opened, no `pg` is loaded, nothing is logged. A migration step that
   * connected anyway would make `pg` a hard requirement of every deployment,
   * which is the opposite of what the optional dependency is for.
   */
  it('does nothing at all on Redis', async () => {
    await expect(
      migrateQueueSchema(redisBackend('redis://localhost:6379'), log),
    ).resolves.toBeUndefined();
    expect(log.info).not.toHaveBeenCalled();
  });
});

describe('describeBackend', () => {
  it('names the schema, which is the half an operator gets wrong', () => {
    const backend = resolveQueueBackend({
      BULLMQ_BACKEND: 'postgres',
      DATABASE_URL: 'postgresql://localhost:5432/ragen',
      BULLMQ_POSTGRES_SCHEMA: 'ragen_queues',
    });

    expect(describeBackend(backend)).toBe('postgres (schema "ragen_queues")');
  });

  it('says redis without a url, because the url is a credential', () => {
    expect(describeBackend(redisBackend('redis://user:pass@host:6379'))).toBe(
      'redis',
    );
  });
});

import {
  createPostgresBackend,
  DEFAULT_SCHEMA,
  quoteSchemaName,
  runMigrations,
  type ConnectionOptions,
  type IQueueBackend,
  type Queue,
  type Worker,
} from 'bullmq';

import type { JobLogger } from '@ragenai/jobs';

/**
 * Where the queues live.
 *
 * BullMQ 6 keeps queue state in PostgreSQL as well as in Redis, and
 * `BULLMQ_BACKEND` is the environment seam that picks between them (see
 * `BULLMQ_BACKEND_SEAM` in `@ragenai/env`). Redis stays the default; the
 * PostgreSQL backend exists for an install that would rather run one database
 * than a database and a queue.
 *
 * **This is the only module that knows the difference.** Everything else in
 * this package takes a `QueueBackend` and passes it on, which is what keeps
 * three construction sites from each deciding for themselves — the failure
 * that shape produces is a producer and a worker pointed at different
 * datastores, which looks exactly like a worker that is merely slow.
 */
export type QueueBackend =
  | { readonly kind: 'redis'; readonly connection: ConnectionOptions }
  | {
      readonly kind: 'postgres';
      readonly connection: {
        readonly connectionString: string;
        readonly schema: string;
      };
    };

/** A Redis backend on an explicit url — for tests, which do not read the env. */
export const redisBackend = (url: string | undefined): QueueBackend => ({
  kind: 'redis',
  connection: { url },
});

/**
 * The backend this process was configured for.
 *
 * Read once per construction rather than cached, because a test that flips the
 * variable between harnesses would otherwise get the first answer forever —
 * and because reading an environment variable is not the expensive part of
 * opening a queue.
 *
 * An unset `BULLMQ_BACKEND` is Redis, matching the seam's `defaultVariant`. An
 * unrecognised value is *not* quietly treated as Redis: a typo would then send
 * the producers to one datastore and, if the worker's copy of the variable
 * differed, the worker to another.
 */
export function resolveQueueBackend(
  env: Record<string, string | undefined> = process.env,
): QueueBackend {
  const chosen = env.BULLMQ_BACKEND?.trim();

  if (!chosen || chosen === 'redis') {
    return redisBackend(env.REDIS_URL);
  }

  if (chosen !== 'postgres') {
    throw new Error(
      `BULLMQ_BACKEND="${chosen}" is not a backend this build knows — expected redis or postgres`,
    );
  }

  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    // The env schema requires this under `postgres`, so reaching here means a
    // process that skipped it. Failing with the variable named is still better
    // than `pg` reporting a connection to an undefined host.
    throw new Error(
      'BULLMQ_BACKEND=postgres needs DATABASE_URL — the queues live in a schema of the database that is already there',
    );
  }

  return {
    kind: 'postgres',
    connection: {
      connectionString,
      /**
       * Never `public`. The backend creates and migrates whatever schema it is
       * given, so pointing it at the one Prisma owns would put queue tables
       * among the application's and make a migration of either a question
       * about both.
       */
      schema: env.BULLMQ_POSTGRES_SCHEMA?.trim() || DEFAULT_SCHEMA,
    },
  };
}

/**
 * The factory BullMQ's constructors take as their last argument.
 *
 * `undefined` for Redis rather than `createRedisBackend`, so the Redis path
 * stays exactly the call it was before this module existed — the default
 * factory, chosen by BullMQ. A wrapper that passed the Redis factory
 * explicitly would look equivalent and would quietly stop tracking whatever
 * the library's default becomes.
 */
export function backendFactoryFor(backend: QueueBackend) {
  return backend.kind === 'postgres' ? createPostgresBackend : undefined;
}

/**
 * Bring the queue schema up to date. **The worker's boot path only.**
 *
 * Migrations are DDL, and a producer is a web request handler: apps/web and
 * apps/api enqueue, and neither should be the process that creates tables. The
 * cost of that separation is a boot order — a producer that starts against a
 * schema no worker has migrated yet fails on its first enqueue, with BullMQ's
 * `SchemaMigrationRequiredError` naming the schema. That is the right failure
 * and the right place for it, but it is a real operational note rather than a
 * theoretical one, so it is written here as well as in the docs.
 *
 * Safe to run concurrently and safe to re-run: BullMQ applies every pending
 * migration inside one transaction, behind a transaction-scoped advisory lock
 * namespaced per schema, so many workers booting together apply them exactly
 * once and late starters observe the finished version and no-op.
 *
 * A Redis backend returns without opening anything.
 */
export async function migrateQueueSchema(
  backend: QueueBackend,
  log: JobLogger,
): Promise<void> {
  if (backend.kind !== 'postgres') {
    return;
  }

  // Imported here, not at the top: `pg` is BullMQ's own optional dependency,
  // lazily required by the factory precisely so a Redis-only install never
  // needs it. A static import would undo that for every process in this
  // repository, Redis ones included.
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: backend.connection.connectionString,
    // One connection: this runs once at boot, holds an advisory lock for the
    // duration, and then the pool is closed.
    max: 1,
  });

  try {
    const version = await runMigrations(pool, backend.connection.schema);
    log.info('queue schema is up to date', {
      schema: backend.connection.schema,
      version,
    });
  } finally {
    await pool.end();
  }
}

/** One line an operator can match against what they configured. */
export function describeBackend(backend: QueueBackend): string {
  return backend.kind === 'postgres'
    ? `postgres (schema "${backend.connection.schema}")`
    : 'redis';
}

/**
 * A queue and a worker on *whichever* backend this install chose.
 *
 * BullMQ's classes are generic over the backend and default that parameter to
 * `RedisQueueBackend`, so the plain `Queue` and `Worker` types mean "on Redis"
 * — and a Postgres-backed instance is not assignable to them. Widening the
 * parameter to the interface both backends implement is what lets one code
 * path hold either.
 *
 * The cost is precise and worth naming: `backend.client` is a Redis-only
 * escape hatch and disappears from these types, which is correct. The one
 * place that needs it casts, next to the runtime check that makes the cast
 * true.
 */
export type AnyQueue = Queue<
  unknown,
  unknown,
  string,
  unknown,
  unknown,
  string,
  IQueueBackend
>;

export type AnyWorker = Worker<unknown, unknown, string, IQueueBackend>;

/**
 * Drop the queue schema and rebuild it. **Destructive, and for tests only.**
 *
 * The jobs-integration suite flushes Redis database 15 between tests so each
 * one starts from nothing; this is the PostgreSQL counterpart, and it has to
 * live in this package because dropping a schema safely needs `quoteSchemaName`
 * and the migrator — both of which come from `bullmq`, which the architecture
 * guard allows here and nowhere else.
 *
 * It refuses `public` for the same reason the environment schema does: the
 * caller would be asking to drop every table the application owns. That guard
 * is the whole reason this is a named export rather than three lines in a test
 * helper — a `DROP SCHEMA ... CASCADE` assembled next to the test that needs it
 * is one typo away from a very bad afternoon.
 */
export async function resetQueueSchemaForTests(
  backend: QueueBackend,
  log: JobLogger,
): Promise<void> {
  if (backend.kind !== 'postgres') {
    return;
  }

  const { schema, connectionString } = backend.connection;
  if (schema.trim().toLowerCase() === 'public') {
    throw new Error(
      'refusing to drop the "public" schema: that is where the application\'s own tables live',
    );
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query(
      `DROP SCHEMA IF EXISTS ${quoteSchemaName(schema)} CASCADE`,
    );
  } finally {
    await pool.end();
  }

  await migrateQueueSchema(backend, log);
}

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { Queue } from 'bullmq';

import {
  backendFactoryFor,
  type AnyQueue,
  type QueueBackend,
} from './backend.js';
import type { JobLogger } from '@ragenai/jobs';

import { QUEUE_NAMES } from './queues.js';

/**
 * The queue dashboard.
 *
 * Temporal UI on port 8080 is how anyone currently sees what the worker is
 * doing, and it is not in the install once Temporal goes — so this ships with
 * the runtime rather than after it. An operator with no view of the queues has
 * no way to tell a stuck job from an empty one.
 *
 * Built as a function returning the app rather than something that binds a
 * port, so the auth and the health route can be tested without a socket.
 */

export const DEFAULT_ADMIN_PORT = 8090;

/**
 * Constant-time comparison over digests rather than the raw values.
 *
 * `timingSafeEqual` throws on length mismatch, which on its own would leak the
 * length of the configured password through an exception. Hashing first makes
 * both sides 32 bytes whatever was supplied, so the comparison is constant
 * time *and* total.
 */
function matches(supplied: string, expected: string): boolean {
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export interface DashboardCredentials {
  user: string;
  password: string;
}

/**
 * Basic Auth over the whole board.
 *
 * Not a session, not a login page: this is one operator-facing surface on a
 * port of its own, and the alternative worth having is the `apps/admin` route
 * behind Better Auth and `isAppAdmin()` — which is a follow-up, not a reason to
 * ship the board unauthenticated in the meantime.
 */
function requireBasicAuth(
  credentials: DashboardCredentials,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');

    if (scheme !== 'Basic' || !encoded) {
      res.setHeader('WWW-Authenticate', 'Basic realm="ragen-queues"');
      res.status(401).send('Authentication required');
      return;
    }

    const [user, ...rest] = Buffer.from(encoded, 'base64')
      .toString('utf8')
      .split(':');
    const password = rest.join(':');

    // Both compared, and both in constant time: comparing the user with `===`
    // would make the username a timing oracle even while the password is safe.
    if (
      !matches(user ?? '', credentials.user) ||
      !matches(password, credentials.password)
    ) {
      res.setHeader('WWW-Authenticate', 'Basic realm="ragen-queues"');
      res.status(401).send('Authentication required');
      return;
    }

    next();
  };
}

export interface DashboardOptions {
  queues: AnyQueue[];
  credentials: DashboardCredentials;
}

export function createDashboardApp(options: DashboardOptions): Express {
  const app = express();

  // Before the auth middleware, deliberately. A health check that needed
  // credentials would either be useless to a platform's probe or force the
  // credentials into the deployment's health configuration.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(requireBasicAuth(options.credentials));

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/');
  createBullBoard({
    /**
     * The cast is bull-board's typing lagging its own runtime, not a claim
     * about this queue.
     *
     * `BullMQAdapter`'s signature still names the Redis-backed `Queue`, while
     * its implementation handles either: `getDatastoreStats()` queries the
     * `pg` pool through `queue.getBackend()`, `getRedisInfo()` returns null
     * instead of throwing when there is no Redis client, and the source says
     * "v6: reuse the queue's backend, so the producer works on any datastore".
     * Verified against @bull-board/api 9.10 — re-check on a major upgrade,
     * because a dashboard that renders an empty board is the failure this
     * hides if it ever stops being true.
     */
    queues: options.queues.map(
      (queue) => new BullMQAdapter(queue as unknown as Queue),
    ),
    serverAdapter,
  });

  app.use('/', serverAdapter.getRouter());

  return app;
}

export interface QueueDashboard {
  port: number;
  close(): Promise<void>;
}

export interface StartDashboardOptions {
  /**
   * The same backend the workers consume from. bull-board reads a queue's
   * counts through the queue object, so pointing the dashboard at a different
   * datastore than the workers would render an empty board and no error —
   * which is why this is the backend rather than a connection of its own.
   */
  backend: QueueBackend;
  log: JobLogger;
  port?: number;
  user?: string;
  password?: string;
}

/**
 * Start the dashboard, or say why it is not starting.
 *
 * **Off unless both credentials are set.** A queue dashboard that appears by
 * default on an unauthenticated port is a finding, not a feature — it exposes
 * every job's payload, which here includes document names and organization
 * ids. Returning `null` rather than throwing is deliberate: a deployment that
 * has not configured the board is a normal deployment, and refusing to run the
 * worker over an optional operator surface would be the wrong trade.
 */
export async function startQueueDashboard(
  options: StartDashboardOptions,
): Promise<QueueDashboard | null> {
  const user = options.user?.trim();
  const password = options.password?.trim();

  if (!user || !password) {
    options.log.info(
      'queue dashboard is off; set WORKER_ADMIN_USER and WORKER_ADMIN_PASSWORD to enable it',
    );
    return null;
  }

  const port = options.port ?? DEFAULT_ADMIN_PORT;
  const queues: AnyQueue[] = [];
  let server: Server;

  // Total: this never throws. The dashboard is a *view* of the queues, and the
  // worker that owns them has already started consuming by the time this runs
  // — so an optional operator surface failing to bind must not take the jobs
  // down with it. Letting it propagate did exactly that: the boot rejected,
  // the process exited, and every in-flight job's lock was stranded for the
  // five minutes `LOCK_DURATION_MS` allows, to be redelivered afterwards.
  // `EADDRINUSE` on 8090 is the everyday way in.
  //
  // The whole body is covered rather than the `listen` alone, because opening
  // the queues and building the app can fail too, and a caller cannot tell
  // those apart from a bind failure.
  try {
    for (const name of QUEUE_NAMES) {
      queues.push(
        new Queue(
          name,
          { connection: options.backend.connection },
          backendFactoryFor(options.backend),
        ),
      );
    }

    const app = createDashboardApp({
      queues,
      credentials: { user, password },
    });

    server = await new Promise<Server>((resolve, reject) => {
      const listening = app.listen(port, () => resolve(listening));
      listening.once('error', reject);
    });
  } catch (error) {
    // Whatever was opened, closed: these connections would otherwise outlive
    // the failure and keep a socket per queue against a Redis nothing is
    // reading from.
    await Promise.allSettled(queues.map((queue) => queue.close()));
    options.log.error(
      'queue dashboard could not start; the worker continues without it',
      { port, err: String(error) },
    );
    return null;
  }

  options.log.info('queue dashboard listening', { port });

  return {
    port,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.all(queues.map((queue) => queue.close()));
    },
  };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

/**
 * The dashboard is an operator surface carrying every job's payload — document
 * names, organization ids, file ids. So what is asserted here is mostly who
 * gets in, not what it renders.
 */

const queueClose = vi.hoisted(() => vi.fn(async () => undefined));

/**
 * A literal rather than `redisBackend()`, because this file mocks `bullmq`
 * wholesale — importing the backend module would pull the real one through the
 * mock, which does not carry the PostgreSQL exports it reads at load time.
 * What the dashboard needs from a backend here is the shape, not the helper.
 */
const REDIS_BACKEND = { kind: 'redis', connection: {} } as const;

vi.mock('bullmq', () => ({
  Queue: class {
    close = queueClose;
  },
}));

vi.mock('@bull-board/api', () => ({ createBullBoard: vi.fn() }));
vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: class {},
}));
vi.mock('@bull-board/express', () => ({
  ExpressAdapter: class {
    setBasePath = vi.fn();
    getRouter = () => (_req: unknown, res: { send: (b: string) => void }) => {
      res.send('board');
    };
  },
}));

const { createDashboardApp, startQueueDashboard } =
  await import('../dashboard.js');

const credentials = { user: 'ops', password: 'correct-horse' };
const basic = (user: string, password: string): string =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

const app = () => createDashboardApp({ queues: [], credentials });

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(() => vi.clearAllMocks());

describe('who reaches the board', () => {
  it('refuses a request with no credentials', async () => {
    const response = await request(app()).get('/');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
  });

  it.each([
    ['the wrong password', 'ops', 'guess'],
    ['the wrong user', 'nobody', 'correct-horse'],
    ['both wrong', 'nobody', 'guess'],
    ['an empty password', 'ops', ''],
  ])('refuses %s', async (_label, user, password) => {
    const response = await request(app())
      .get('/')
      .set('Authorization', basic(user, password));

    expect(response.status).toBe(401);
  });

  it('lets the configured operator through', async () => {
    const response = await request(app())
      .get('/')
      .set('Authorization', basic('ops', 'correct-horse'));

    expect(response.status).toBe(200);
  });

  // A password containing a colon is split on the first one only; treating
  // every colon as a separator would lock the operator out of their own board.
  it('accepts a password containing a colon', async () => {
    const withColon = { user: 'ops', password: 'a:b:c' };
    const response = await request(
      createDashboardApp({ queues: [], credentials: withColon }),
    )
      .get('/')
      .set('Authorization', basic('ops', 'a:b:c'));

    expect(response.status).toBe(200);
  });

  it('refuses a scheme that is not Basic', async () => {
    const response = await request(app())
      .get('/')
      .set('Authorization', 'Bearer something');

    expect(response.status).toBe(401);
  });
});

/**
 * Before the auth middleware on purpose: a health check needing credentials is
 * either useless to a platform probe or forces the credentials into the
 * deployment's health configuration.
 */
describe('the health route', () => {
  it('answers without credentials', async () => {
    const response = await request(app()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('startQueueDashboard', () => {
  /**
   * A queue dashboard that appears by default on an unauthenticated port is a
   * finding, not a feature — every job's payload is on it.
   */
  it.each([
    ['neither credential', {}],
    ['only a user', { user: 'ops' }],
    ['only a password', { password: 'correct-horse' }],
    ['a blank user', { user: '  ', password: 'correct-horse' }],
  ])('does not start with %s', async (_label, over) => {
    const dashboard = await startQueueDashboard({
      backend: REDIS_BACKEND,
      log,
      ...over,
    });

    expect(dashboard).toBeNull();
  });

  // Not thrown: a deployment that has not configured the board is a normal
  // deployment, and refusing to run the worker over an optional operator
  // surface would be the wrong trade.
  it('says why it is off rather than failing the boot', async () => {
    await startQueueDashboard({ backend: REDIS_BACKEND, log });

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('WORKER_ADMIN_USER'),
    );
  });
});

/**
 * The dashboard starts *after* the workers are consuming and *before* the
 * shutdown task is registered, so a throw here exits the process with jobs in
 * flight and no drain — every lock stranded for five minutes, then
 * redelivered. Losing a race for port 8090 must not cost that.
 *
 * Forced with an out-of-range port rather than a real `EADDRINUSE`: two
 * wildcard binds coexist on a dual-stack host often enough that the conflict
 * is not reproducible across machines, and the property under test is that
 * *no* startup failure escapes — which is why the whole body is wrapped rather
 * than the `listen` call alone.
 */
describe('when the dashboard cannot start', () => {
  it('returns null instead of throwing, and closes what it opened', async () => {
    queueClose.mockClear();

    const dashboard = await startQueueDashboard({
      backend: REDIS_BACKEND,
      log,
      port: 999_999,
      user: 'ops',
      password: 'correct-horse',
    });

    expect(dashboard).toBeNull();
    expect(log.error).toHaveBeenCalled();
    // Otherwise the failure leaves a socket per queue open against a Redis
    // nothing is reading from.
    expect(queueClose).toHaveBeenCalled();
  });
});

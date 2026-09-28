import {
  DOCLING_STATUS_INTERVAL_MS,
  DOCLING_STATUS_KEY,
  DOCLING_STATUS_TTL_SECONDS,
  type DoclingStatus,
} from '@ragenai/platform-contracts';

import { isDoclingAvailable } from './docling-client.js';

type Log = {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

type Dependencies = {
  check: () => Promise<boolean>;
  /** Stores the serialised status with an expiry, in seconds. */
  write: (value: string, ttlSeconds: number) => Promise<void>;
  log: Log;
  now?: () => Date;
  /**
   * Ask again before calling Docling down. One failed look is not an outage:
   * the first probe runs while the worker is still importing its modules,
   * and a blocked event loop lets `isDoclingAvailable`'s 5 s timeout fire on
   * a Docling that answered. At boot that logged "Docling is unavailable"
   * and published "down" for up to 30 s — 2 of 5 local starts on 2026-09-28,
   * with Docling healthy — which the setup page would have shown as an
   * outage. Off unless given, so a probe stays one look in its own tests.
   */
  confirmDown?: { delayMs: number; sleep?: (ms: number) => Promise<void> };
};

/**
 * How long the publisher waits before asking again, when a look says Docling
 * is down. Long enough for a worker to finish booting; short against the 30 s
 * between probes, so a real outage is still reported on the probe that saw it.
 */
export const DOCLING_STATUS_CONFIRM_DELAY_MS = 5_000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One probe of Docling, published for apps/web, and logged when — only when —
 * the answer changes (spec 2026-09-26-docling-under-load, C1 and D5).
 *
 * One `error` when Docling goes down and one `info` when it comes back, not a
 * line per probe: an outage of an hour is two log lines, which is what an
 * operator can read and an alert can match. The first probe after boot logs
 * only if Docling is down; a Docling that is up at boot is not news.
 *
 * `since` is the time of the last change, so the panel can say "down since
 * 09:15" rather than "down as of the last probe".
 */
export function createDoclingStatusProbe({
  check,
  write,
  log,
  now = () => new Date(),
  confirmDown,
}: Dependencies): () => Promise<DoclingStatus> {
  let last: DoclingStatus | null = null;

  const look = () => check().catch(() => false);

  return async () => {
    let up = await look();
    if (!up && confirmDown) {
      await (confirmDown.sleep ?? defaultSleep)(confirmDown.delayMs);
      up = await look();
    }
    const at = now().toISOString();

    if (last === null) {
      if (!up) {
        log.error({ docling: 'down' }, 'Docling is unavailable');
      }
    } else if (last.up !== up) {
      if (up) {
        log.info(
          { docling: 'up', downSince: last.since },
          'Docling is available again',
        );
      } else {
        log.error({ docling: 'down' }, 'Docling became unavailable');
      }
    }

    const since = last && last.up === up ? last.since : at;
    const status: DoclingStatus = { up, since, checkedAt: at };
    last = status;

    // Best-effort: the status is a view for the panel, and a failed write
    // must not stop the next probe. The expiry is what makes a stopped worker
    // read as "unknown" rather than as its last answer.
    await write(JSON.stringify(status), DOCLING_STATUS_TTL_SECONDS).catch(
      () => undefined,
    );
    return status;
  };
}

/**
 * Probes Docling every `DOCLING_STATUS_INTERVAL_MS` and publishes the answer
 * to Redis under `DOCLING_STATUS_KEY`. Returns the function that stops it.
 *
 * Its own Redis connection, not one of BullMQ's: those belong to the queues,
 * and a status write should not share a socket with job traffic.
 */
export async function startDoclingStatusPublisher({
  redisUrl,
  log,
  check = isDoclingAvailable,
  intervalMs = DOCLING_STATUS_INTERVAL_MS,
  confirmDelayMs = DOCLING_STATUS_CONFIRM_DELAY_MS,
}: {
  redisUrl: string;
  log: Log;
  check?: () => Promise<boolean>;
  intervalMs?: number;
  confirmDelayMs?: number;
}): Promise<() => Promise<void>> {
  const { Redis } = await import('ioredis');
  const redis = new Redis(redisUrl, {
    // A publisher that cannot reach Redis should retry quietly, not fail
    // every probe: the queue connection reports a Redis outage already.
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
  // ioredis emits connection errors as events; unhandled, they crash Node.
  redis.on('error', () => undefined);

  const probe = createDoclingStatusProbe({
    check,
    write: async (value, ttl) => {
      await redis.set(DOCLING_STATUS_KEY, value, 'EX', ttl);
    },
    log,
    confirmDown: { delayMs: confirmDelayMs },
  });

  void probe();
  const timer = setInterval(() => void probe(), intervalMs);
  // Never the reason the process stays alive: the workers are.
  timer.unref();

  return async () => {
    clearInterval(timer);
    await redis.quit().catch(() => undefined);
  };
}

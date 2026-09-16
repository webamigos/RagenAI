import type { JobLogger } from '@ragenai/jobs';

/**
 * A Redis that evicts is a Redis that loses jobs.
 *
 * Queue state *is* the data here — there is no database behind it to rebuild
 * from — so a `maxmemory-policy` of `allkeys-lru` does not degrade
 * performance, it deletes work at random under load, silently and at the worst
 * possible moment. A managed Redis defaulting to an eviction policy is common
 * enough that this is worth a boot check rather than a line in a runbook.
 *
 * `noeviction` is the only safe value: every `volatile-*` policy is safe only
 * while nothing sets a TTL, which BullMQ's own retention does.
 */
export const EVICTION_MESSAGE =
  'REDIS_URL points at an instance with maxmemory-policy set to eviction. BullMQ queue state is the data — an evicting Redis deletes jobs at random under memory pressure. Set maxmemory-policy to noeviction.';

export interface RedisConfigReader {
  config(operation: 'GET', parameter: string): Promise<unknown>;
}

/**
 * Refuse to start against an evicting instance.
 *
 * Deliberately *not* best-effort about the answer it gets, and deliberately
 * forgiving about not getting one: a managed Redis that forbids `CONFIG GET`
 * (Upstash, some ElastiCache setups) is a normal deployment, and refusing to
 * boot because a diagnostic is unavailable would be a check that costs more
 * than it catches. Unreadable warns; readable and wrong refuses.
 */
export async function assertNoEviction(
  client: RedisConfigReader,
  log: JobLogger,
): Promise<void> {
  let policy: string | undefined;

  try {
    const result = await client.config('GET', 'maxmemory-policy');
    // ioredis answers `['maxmemory-policy', 'noeviction']`; a RESP3 client
    // answers an object. Both shapes, because which one this gets depends on
    // a connection option nothing here sets.
    policy = Array.isArray(result)
      ? String(result[1])
      : ((result as Record<string, string> | null)?.['maxmemory-policy'] ??
        undefined);
  } catch (error) {
    log.warn(
      'could not read maxmemory-policy; continuing without the eviction check',
      { err: String(error) },
    );
    return;
  }

  if (policy === undefined || policy === '') {
    log.warn('maxmemory-policy came back empty; skipping the eviction check');
    return;
  }

  if (policy !== 'noeviction') {
    throw new Error(`${EVICTION_MESSAGE} (it is currently "${policy}")`);
  }
}

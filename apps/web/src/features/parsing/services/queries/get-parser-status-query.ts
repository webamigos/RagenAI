import 'server-only';

import {
  DOCLING_STATUS_KEY,
  readDoclingStatus,
} from '@ragenai/platform-contracts';

import { RedisService } from '@/app/lib/services/redis';
import { logger } from '@/app/lib/utils/logger';

/**
 * The document parser as the worker last saw it (spec
 * 2026-09-26-docling-under-load, C1 and D5).
 *
 * The worker probes Docling and publishes the answer to Redis; this reads it.
 * apps/web does not probe Docling itself — it does not know where Docling is,
 * and the worker's view is the one that decides whether a file gets parsed.
 *
 * `unknown` covers everything that is not an answer: no Redis, nothing
 * published (no worker running, or a deployment not parsing with Docling), a
 * stale or malformed value, a failed read. The panel shows nothing for it:
 * an unknown is not an outage, and a warning nobody can explain is noise.
 */
export type ParserStatus =
  { state: 'up' } | { state: 'down'; since: string } | { state: 'unknown' };

type RedisReader = { get: (key: string) => Promise<string | null> };

export async function getParserStatusQuery(
  redis: RedisReader | null = RedisService.getInstance(),
): Promise<ParserStatus> {
  if (!redis) {
    return { state: 'unknown' };
  }
  try {
    const status = readDoclingStatus(await redis.get(DOCLING_STATUS_KEY));
    if (!status) {
      return { state: 'unknown' };
    }
    return status.up ? { state: 'up' } : { state: 'down', since: status.since };
  } catch (error) {
    logger.warn(
      { errorName: (error as Error)?.name },
      'Could not read the document parser status',
    );
    return { state: 'unknown' };
  }
}

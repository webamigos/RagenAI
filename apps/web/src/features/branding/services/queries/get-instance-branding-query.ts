import db from '@ragenai/prisma-client';

import { logger } from '@/app/lib/utils/logger';
import { isInstanceFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

import {
  BRANDING_CACHE_TTL_MS,
  BRANDING_FAILURE_TTL_MS,
  INSTANCE_BRANDING_ID,
} from '../../constants';
import {
  DEFAULT_INSTANCE_BRANDING,
  type InstanceBranding,
} from '../../contracts/branding.types';
import { toInstanceBranding } from '../../utils/to-instance-branding';

type CacheEntry = {
  readonly value: InstanceBranding;
  readonly expiresAt: number;
};

/**
 * Process scope, deliberately, like the guardrail loader's cache.
 *
 * The answer is the same for every request on the install, so `React.cache`
 * — one read per request — would be the wrong scope: it would put two
 * queries on every panel render and every sign-in page for a value that
 * changes perhaps once.
 *
 * On `globalThis` rather than in a module variable: Next bundles route
 * handlers and server components separately, so a module variable exists
 * once per bundle. The save arrives through a route handler, and clearing
 * only that copy left the panel, rendered by the other, on the old branding
 * for the rest of the window.
 */
const CACHE = Symbol.for('ragen.instance-branding.cache');

type CacheHolder = { entry: CacheEntry | null };

function holder(): CacheHolder {
  const scope = globalThis as typeof globalThis & {
    [CACHE]?: CacheHolder;
  };
  scope[CACHE] ??= { entry: null };
  return scope[CACHE];
}

/**
 * Drops the cached branding. The save command calls it, so the process that
 * handled a save shows it on the very next request; tests call it too.
 */
export function clearInstanceBrandingCache(): void {
  holder().entry = null;
}

/**
 * The install's branding, or today's Ragen branding.
 *
 * Today's branding is the answer in four cases, and only the first is the
 * usual one:
 *
 * 1. the `instanceBranding` key is off — the row is then not even read, which
 *    is what makes turning the key off a complete rollback (spec, "Rollout
 *    and rollback");
 * 2. there is no row;
 * 3. `next build` is collecting page data, where there is no database to ask
 *    and nothing should be baked into a page;
 * 4. the read failed. Branding is decoration, and the sign-in page must not
 *    go down with the database's first blip — the panel will report that on
 *    its own. A previous good answer is kept rather than reset to the
 *    default, so a blip does not flash the old logo either.
 */
export async function getInstanceBrandingQuery(): Promise<InstanceBranding> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return DEFAULT_INSTANCE_BRANDING;
  }

  const cache = holder();
  const now = Date.now();
  if (cache.entry && cache.entry.expiresAt > now) {
    return cache.entry.value;
  }

  try {
    const enabled = await isInstanceFeatureEnabledQuery('instanceBranding');
    const row = enabled
      ? await db.instanceBranding.findUnique({
          where: { id: INSTANCE_BRANDING_ID },
          select: {
            productName: true,
            logoStorageKey: true,
            primaryToken: true,
            updatedAt: true,
          },
        })
      : null;

    const value = toInstanceBranding(row);
    cache.entry = { value, expiresAt: now + BRANDING_CACHE_TTL_MS };
    return value;
  } catch (error) {
    logger.warn({ err: error }, 'Could not read instance branding');
    const value = cache.entry?.value ?? DEFAULT_INSTANCE_BRANDING;
    cache.entry = { value, expiresAt: now + BRANDING_FAILURE_TTL_MS };
    return value;
  }
}

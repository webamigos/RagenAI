import { logger } from '@/app/lib/utils/logger';
import { countUserMemoriesQuery } from '@/features/memory/services/queries/get-user-memories-query';
import { getEffectiveFeaturesQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

/**
 * The flags the settings rail filters `featureFlag` entries by.
 *
 * `personalMemory` also counts as on while the user still has memories
 * stored, so the page that erases them stays findable after an org turns the
 * feature off. When that cannot be determined — the flags or the count would
 * not read — it counts as on as well: an unknown is not a confirmed zero, and
 * a link to an erasure page the user did not need costs less than hiding one
 * they did. The page itself decides which controls to show.
 */
export async function navFeatureFlags(
  organizationId: string,
): Promise<Record<string, boolean>> {
  let flags: Record<string, boolean>;
  try {
    flags = await getEffectiveFeaturesQuery(organizationId);
  } catch (err) {
    logger.error({ err }, 'navFeatureFlags: feature flags unavailable');
    return { personalMemory: true };
  }

  if (flags.personalMemory) {
    return flags;
  }
  try {
    return { ...flags, personalMemory: (await countUserMemoriesQuery()) > 0 };
  } catch (err) {
    logger.error(
      { err },
      'navFeatureFlags: memory count unavailable; listing the memory page',
    );
    return { ...flags, personalMemory: true };
  }
}

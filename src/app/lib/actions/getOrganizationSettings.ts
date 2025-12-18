'use server';

import { getAllSettings } from '@/app/lib/services/settings';
import { setSentryClerkOrganizationTag } from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export async function getOrganizationSettings() {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();

    setSentryClerkOrganizationTag(orgId);

    const settings = await getAllSettings(orgId);

    return {
      success: true,
      settings,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error getting organization settings');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      settings: null,
    };
  }
}

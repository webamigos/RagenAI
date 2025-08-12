'use server';

import { auth } from '@clerk/nextjs/server';
import { getAllSettings } from '@/app/lib/services/settings';
import { setSentryClerkOrganizationTag } from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';

export async function getOrganizationSettings() {
  try {
    const { orgId } = auth();

    if (!orgId) {
      throw new Error('Unauthorized');
    }

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

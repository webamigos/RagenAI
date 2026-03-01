'use server';

import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

/** @deprecated Use getAllSettings from @/features/organizations directly */
export async function getOrganizationSettings() {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();

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

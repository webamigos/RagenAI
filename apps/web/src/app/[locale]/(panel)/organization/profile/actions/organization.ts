'use server';

import { revalidatePath } from 'next/cache';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';
import {
  getUpdateOrganizationSchema,
  type UpdateOrganizationFormData,
} from '../types';
import { getActiveMember } from '@/lib/auth-guards';
import { canManageOrg } from '@/lib/auth-access-control';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { failure } from '../errors';

/**
 * Update organization profile
 * Only owner/admin can update
 */
export async function updateOrganization(data: UpdateOrganizationFormData) {
  try {
    // 1. Validate input
    // Only whether the input is valid is used here, never the schema's
    // messages, so the translator is the identity. What the action says to the
    // user is a separate matter (#1092).
    const validated = getUpdateOrganizationSchema((key) => key).safeParse(data);
    if (!validated.success) {
      return failure('invalid-data');
    }

    // 2. Derive org from session
    const organizationId = await getOrgIdFromAuthOrThrow();

    // 3. Check permissions
    const activeMember = await getActiveMember(organizationId);

    if (!activeMember || !canManageOrg(activeMember.role)) {
      return failure('no-permission-edit-organization');
    }

    // 4. Update organization
    const { name } = validated.data;

    await db.organization.update({
      where: { id: organizationId },
      data: {
        name: name.trim(),
      },
    });

    logger.info(
      `Organization ${organizationId} updated by member ${activeMember.id}`,
    );

    // 5. Revalidate cache
    revalidatePath('/organization/profile');

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Error updating organization:', error);
    return failure('update-organization-failed');
  }
}

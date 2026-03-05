'use server';

import { revalidatePath } from 'next/cache';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';
import {
  UpdateOrganizationSchema,
  type UpdateOrganizationFormData,
} from '../types';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';

/**
 * Update organization profile
 * Only owner/admin can update
 */
export async function updateOrganization(
  organizationId: string,
  data: UpdateOrganizationFormData,
) {
  try {
    // 1. Validate input
    const validated = UpdateOrganizationSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: 'Nieprawidłowe dane',
      };
    }

    // 2. Check permissions
    const activeMember = await getActiveMember(organizationId);

    if (!activeMember || !isOrgAdmin(activeMember.role)) {
      return {
        success: false,
        error: 'Nie masz uprawnień do edycji profilu organizacji',
      };
    }

    // 3. Update organization
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
    revalidatePath('/settings/organization-profile');

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Error updating organization:', error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas aktualizacji organizacji',
    };
  }
}

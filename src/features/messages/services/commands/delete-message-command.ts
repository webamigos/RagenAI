'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import { handleCommandError } from '@/shared/utils/error-handling';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export async function deleteMessageCommand(
  publicId: string,
): Promise<OperationResult> {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();

    const message = await db.message.findFirst({
      where: {
        publicId: publicId,
        thread: { project: { organizationId: orgId } },
      },
      select: { id: true },
    });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    await db.message.delete({
      where: { id: message.id },
    });

    return { success: true };
  } catch (error) {
    return handleCommandError(error, 'Failed to delete message');
  }
}

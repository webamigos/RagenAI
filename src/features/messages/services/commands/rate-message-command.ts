'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import { handleCommandError } from '@/shared/utils/error-handling';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export async function rateMessageCommand(
  messagePublicId: string,
  feedback: 'up' | 'down',
): Promise<OperationResult> {
  try {
    if (feedback !== 'up' && feedback !== 'down') {
      return { success: false, error: 'Invalid feedback' };
    }

    const orgId = await getOrgIdFromAuthOrThrow();

    const message = await db.message.findFirst({
      where: {
        publicId: messagePublicId,
        thread: { organizationId: orgId },
      },
      select: { id: true },
    });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    await db.message.update({
      where: { id: message.id },
      data: { rate: feedback === 'up' ? 1 : 0 },
    });

    return { success: true };
  } catch (error) {
    return handleCommandError(error, 'Failed to rate message');
  }
}

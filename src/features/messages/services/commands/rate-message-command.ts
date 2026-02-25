'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import { handleCommandError } from '@/shared/utils/error-handling';

export async function rateMessageCommand(
  messagePublicId: string,
  feedback: 'up' | 'down'
): Promise<OperationResult> {
  try {
    if (feedback !== 'up' && feedback !== 'down') {
      return { success: false, error: 'Invalid feedback' };
    }

    await db.message.update({
      where: { public_id: messagePublicId },
      data: { rate: feedback === 'up' ? 1 : 0 },
    });

    return { success: true };
  } catch (error) {
    return handleCommandError(error, 'Failed to rate message');
  }
}

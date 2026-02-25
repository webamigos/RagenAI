'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import { handleCommandError } from '@/shared/utils/error-handling';

export async function deleteMessageCommand(
  publicId: string
): Promise<OperationResult> {
  try {
    await db.message.delete({
      where: { public_id: publicId },
    });

    return { success: true };
  } catch (error) {
    return handleCommandError(error, 'Failed to delete message');
  }
}

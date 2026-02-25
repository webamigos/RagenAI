'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { CreateThreadDto } from '../../contracts/thread.types';

export const findOrCreateThreadCommand = async (
  threadPublicId: CreateThreadDto['public_id'],
  visitorId: string
) => {
  try {
    const threadRecord = await db.thread.findUniqueOrThrow({
      where: { public_id: threadPublicId },
    });

    await db.thread.update({
      where: { public_id: threadPublicId },
      data: {
        visitor_id: visitorId,
      },
    });

    return { threadRecord };
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${threadPublicId}`);
    throw new Error(`Cannot fetch thread ${threadPublicId}`);
  }
};

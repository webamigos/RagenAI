'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { CreateThreadDto } from '../../contracts/thread.types';

export const findOrCreateThreadCommand = async (
  threadPublicId: CreateThreadDto['id'],
  visitorId: string,
  organizationId?: string,
) => {
  try {
    const whereClause: { id: string; organizationId?: string } = {
      id: threadPublicId,
    };

    // Scope to organization when provided to prevent cross-tenant access
    if (organizationId) {
      whereClause.organizationId = organizationId;
    }

    const threadRecord = await db.thread.findFirst({
      where: whereClause,
    });

    if (!threadRecord) {
      throw new Error(`Thread ${threadPublicId} not found`);
    }

    if (!threadRecord.visitorId || threadRecord.visitorId === visitorId) {
      await db.thread.update({
        where: { id: threadRecord.id },
        data: {
          visitorId: visitorId,
        },
      });
    } else {
      logger.warn(
        {
          threadPublicId,
          visitorId,
          existingVisitorId: threadRecord.visitorId,
        },
        'Visitor ID mismatch — thread already bound to another visitor',
      );
      throw new Error('Thread belongs to another session');
    }

    return { threadRecord };
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${threadPublicId}`);
    throw new Error(`Cannot fetch thread ${threadPublicId}`);
  }
};

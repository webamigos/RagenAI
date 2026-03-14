'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { CreateThreadDto } from '../../contracts/thread.types';

export const findOrCreateThreadCommand = async (
  threadPublicId: CreateThreadDto['public_id'],
  visitorId: string,
  organizationId?: string,
) => {
  try {
    const whereClause: { public_id: string; organization_id?: string } = {
      public_id: threadPublicId,
    };

    // Scope to organization when provided to prevent cross-tenant access
    if (organizationId) {
      whereClause.organization_id = organizationId;
    }

    const threadRecord = await db.thread.findFirst({
      where: whereClause,
    });

    if (!threadRecord) {
      throw new Error(`Thread ${threadPublicId} not found`);
    }

    if (!threadRecord.visitor_id || threadRecord.visitor_id === visitorId) {
      await db.thread.update({
        where: { id: threadRecord.id },
        data: {
          visitor_id: visitorId,
        },
      });
    } else {
      logger.warn(
        {
          threadPublicId,
          visitorId,
          existingVisitorId: threadRecord.visitor_id,
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

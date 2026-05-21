import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

type Input = {
  leadListPublicId: string;
  leadPublicIds: string[];
  organizationId: string;
};

// Deletes the named leads from the list and decrements rowCount. Org-scoped:
// the parent list must belong to the caller's org or we treat it as not found.
export const deleteLeadsCommand = async (
  input: Input,
): Promise<{ deleted: number }> => {
  const { leadListPublicId, leadPublicIds, organizationId } = input;
  if (leadPublicIds.length === 0) {
    return { deleted: 0 };
  }
  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }
  try {
    return await db.$transaction(async (tx) => {
      const result = await tx.lead.deleteMany({
        where: {
          leadListId: list.id,
          publicId: { in: leadPublicIds },
        },
      });
      if (result.count > 0) {
        await tx.leadList.update({
          where: { id: list.id },
          data: { rowCount: { decrement: result.count } },
        });
      }
      return { deleted: result.count };
    });
  } catch (error) {
    logger.error(
      { err: error, leadListPublicId, count: leadPublicIds.length },
      'deleteLeadsCommand failed',
    );
    throw error;
  }
};

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

export const deleteLeadListCommand = async (
  publicId: string,
  organizationId: string,
): Promise<void> => {
  const list = await db.leadList.findFirst({
    where: { publicId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }
  try {
    await db.leadList.delete({ where: { id: list.id } });
  } catch (error) {
    logger.error({ err: error, publicId }, 'deleteLeadListCommand failed');
    throw error;
  }
};

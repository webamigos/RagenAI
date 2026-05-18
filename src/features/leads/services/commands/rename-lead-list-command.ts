import db from '@ragenai/prisma-client';
import { NotFoundException } from '@/libs/utils/errors';

export const renameLeadListCommand = async (
  publicId: string,
  organizationId: string,
  name: string,
): Promise<void> => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Name cannot be empty');
  }
  const list = await db.leadList.findFirst({
    where: { publicId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }
  await db.leadList.update({
    where: { id: list.id },
    data: { name: trimmed },
  });
};

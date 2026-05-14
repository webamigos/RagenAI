import db from '@ragenai/prisma-client';

export async function markAsReadCommand({
  publicId,
  userId,
  organizationId,
}: {
  publicId: string;
  userId: string;
  organizationId: string;
}): Promise<void> {
  await db.notification.updateMany({
    where: { publicId, userId, organizationId },
    data: { isRead: true },
  });
}

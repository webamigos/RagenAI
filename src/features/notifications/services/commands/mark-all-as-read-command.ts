import db from '@ragenai/prisma-client';

export async function markAllAsReadCommand({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}): Promise<void> {
  await db.notification.updateMany({
    where: { userId, organizationId, isRead: false },
    data: { isRead: true },
  });
}

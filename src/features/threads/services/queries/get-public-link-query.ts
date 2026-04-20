import db from '@ragenai/prisma-client';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

export async function getPublicLinkQuery(
  threadId: string,
  userId: string,
): Promise<PublicLinkDto | null> {
  const link = await db.threadPublicLink.findUnique({
    where: { threadId },
    select: {
      publicId: true,
      threadId: true,
      expiresAt: true,
      passwordHash: true,
      createdAt: true,
      createdByUserId: true,
      thread: { select: { title: true } },
    },
  });

  if (!link || link.createdByUserId !== userId) {
    return null;
  }

  return {
    publicId: link.publicId,
    threadId: link.threadId,
    threadTitle: link.thread.title,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    hasPassword: link.passwordHash !== null,
    createdAt: link.createdAt.toISOString(),
  };
}

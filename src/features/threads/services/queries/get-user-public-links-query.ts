import db from '@ragenai/prisma-client';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

export async function getUserPublicLinksQuery(
  userId: string,
): Promise<PublicLinkDto[]> {
  const links = await db.threadPublicLink.findMany({
    where: { createdByUserId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      threadId: true,
      expiresAt: true,
      passwordHash: true,
      createdAt: true,
      thread: { select: { title: true } },
    },
  });

  return links.map((link) => ({
    publicId: link.publicId,
    threadId: link.threadId,
    threadTitle: link.thread.title,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    hasPassword: link.passwordHash !== null,
    createdAt: link.createdAt.toISOString(),
  }));
}

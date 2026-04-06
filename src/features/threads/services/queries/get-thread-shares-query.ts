'use server';

import db from '@ragenai/prisma-client';
import type { ThreadShareInfo } from '@/features/threads/contracts/thread.types';

export async function getThreadSharesQuery(
  threadPublicId: string,
  organizationId: string,
  currentUserId: string,
): Promise<ThreadShareInfo> {
  const thread = await db.thread.findFirst({
    where: {
      id: threadPublicId,
      organizationId,
    },
    select: { id: true },
  });

  if (!thread) {
    return { threadId: threadPublicId, sharedWith: [] };
  }

  // Get all org members (excluding current user)
  const members = await db.member.findMany({
    where: {
      organizationId,
      userId: { not: currentUserId },
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  // Get existing shares for this thread
  const existingShares = await db.threadShare.findMany({
    where: { threadId: thread.id },
    select: { userId: true },
  });
  const sharedUserIds = new Set(existingShares.map((s) => s.userId));

  const sharedWith = members.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    isShared: sharedUserIds.has(m.userId),
  }));

  return { threadId: threadPublicId, sharedWith };
}

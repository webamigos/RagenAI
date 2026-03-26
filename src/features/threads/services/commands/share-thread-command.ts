'use server';

import db from '@ragenai/prisma-client';

type ShareThreadInput = {
  threadPublicId: string;
  recipientUserIds: string[];
  organizationId: string;
  currentUserId: string;
};

type OperationResult = { success: true } | { success: false; error: string };

export async function shareThreadCommand(
  input: ShareThreadInput,
): Promise<OperationResult> {
  const { threadPublicId, recipientUserIds, organizationId, currentUserId } =
    input;

  const thread = await db.thread.findFirst({
    where: {
      publicId: threadPublicId,
      organizationId,
    },
    select: { id: true, visitorId: true },
  });

  if (!thread) {
    return { success: false, error: 'Thread not found' };
  }

  if (thread.visitorId !== currentUserId) {
    return { success: false, error: 'Only the thread creator can share it' };
  }

  // Filter out self-sharing
  const filteredRecipients = recipientUserIds.filter(
    (id) => id !== currentUserId,
  );

  // Sync shares in a transaction (membership check inside for atomicity)
  const result = await db.$transaction(async (tx) => {
    // Verify all recipients are org members
    if (filteredRecipients.length > 0) {
      const memberCount = await tx.member.count({
        where: {
          organizationId,
          userId: { in: filteredRecipients },
        },
      });

      if (memberCount !== filteredRecipients.length) {
        return {
          success: false as const,
          error: 'Some recipients are not members of this organization',
        };
      }
    }

    // Remove shares not in the new list
    await tx.threadShare.deleteMany({
      where: {
        threadId: thread.id,
        userId: { notIn: filteredRecipients },
      },
    });

    // Add new shares (skip existing)
    if (filteredRecipients.length > 0) {
      const existing = await tx.threadShare.findMany({
        where: { threadId: thread.id },
        select: { userId: true },
      });
      const existingUserIds = new Set(existing.map((s) => s.userId));

      const newShares = filteredRecipients
        .filter((userId) => !existingUserIds.has(userId))
        .map((userId) => ({
          threadId: thread.id,
          userId,
          sharedByUserId: currentUserId,
        }));

      if (newShares.length > 0) {
        await tx.threadShare.createMany({ data: newShares });
      }
    }

    return { success: true as const };
  });

  return result;
}

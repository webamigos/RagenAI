'use server';

import db from '@ragenai/prisma-client';

type Input = {
  threadId: string;
  currentUserId: string;
};

type Result = { success: true } | { success: false; error: string };

export async function revokePublicLinkCommand(input: Input): Promise<Result> {
  const { threadId, currentUserId } = input;

  const link = await db.threadPublicLink.findUnique({
    where: { threadId },
    select: { id: true, createdByUserId: true },
  });

  if (!link) {
    return { success: false, error: 'Public link not found' };
  }

  if (link.createdByUserId !== currentUserId) {
    return { success: false, error: 'Only the link creator can revoke it' };
  }

  await db.threadPublicLink.delete({ where: { threadId } });

  return { success: true };
}

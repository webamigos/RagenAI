'use server';

import db from '@ragenai/prisma-client';
import bcrypt from 'bcrypt';

type Input = {
  threadId: string;
  organizationId: string;
  currentUserId: string;
  expiresAt: Date | null;
  password?: string;
};

type Result =
  | { success: true; publicId: string }
  | { success: false; error: string };

export async function createPublicLinkCommand(input: Input): Promise<Result> {
  const { threadId, organizationId, currentUserId, expiresAt, password } =
    input;

  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    select: { id: true, visitorId: true },
  });

  if (!thread) {
    return { success: false, error: 'Thread not found' };
  }

  if (thread.visitorId !== currentUserId) {
    return {
      success: false,
      error: 'Only the thread owner can create a public link',
    };
  }

  const existing = await db.threadPublicLink.findUnique({
    where: { threadId: thread.id },
  });

  if (existing) {
    return {
      success: false,
      error: 'Public link already exists. Revoke it first.',
    };
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const link = await db.threadPublicLink.create({
    data: {
      threadId: thread.id,
      createdByUserId: currentUserId,
      expiresAt,
      passwordHash,
    },
    select: { publicId: true },
  });

  return { success: true, publicId: link.publicId };
}

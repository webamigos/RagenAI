import db from '@ragenai/prisma-client';
import bcrypt from 'bcrypt';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import type { PublicThreadResult } from '@/features/threads/contracts/thread.types';

type Input = {
  publicId: string;
  submittedPassword: string | null;
};

export async function getPublicThreadQuery(
  input: Input,
): Promise<PublicThreadResult> {
  const { publicId, submittedPassword } = input;

  const link = await db.threadPublicLink.findUnique({
    where: { publicId },
    select: {
      expiresAt: true,
      passwordHash: true,
      createdBy: { select: { name: true } },
      thread: {
        select: {
          title: true,
          encryptedDek: true,
          messages: {
            select: { role: true, content: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  if (!link) {
    return { status: 'not_found' };
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return { status: 'not_found' };
  }

  if (link.passwordHash) {
    if (!submittedPassword) {
      return { status: 'password_required' };
    }
    const valid = await bcrypt.compare(submittedPassword, link.passwordHash);
    if (!valid) {
      return { status: 'password_invalid' };
    }
  }

  const decryptedMessages = await decryptMessageContents(
    link.thread.messages,
    link.thread.encryptedDek,
  );

  return {
    status: 'ok',
    title: link.thread.title,
    messages: decryptedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    createdByName: link.createdBy.name,
  };
}

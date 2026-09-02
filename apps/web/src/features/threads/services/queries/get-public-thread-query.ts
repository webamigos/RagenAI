import db from '@ragenai/prisma-client';
import bcrypt from 'bcrypt';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import type { PublicThreadResult } from '@/features/threads/contracts/thread.types';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

type Input = {
  publicId: string;
  submittedPassword?: string | null;
  cookieVerified?: boolean;
};

export async function getPublicThreadQuery(
  input: Input,
): Promise<PublicThreadResult> {
  const { publicId, submittedPassword = null, cookieVerified = false } = input;

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
          organizationId: true,
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

  // Turning the feature off has to close links already in circulation, not
  // just stop new ones being minted. The org comes from the thread, not a
  // session — this path serves an unauthenticated visitor.
  //
  // `Thread.organizationId` is nullable, and a thread with no org has no
  // settings to read the flag from, so it cannot be shown to be permitted.
  //
  // `not_found` rather than a "disabled" status in both cases, on purpose:
  // distinguishing them would tell an anonymous holder of the URL that the
  // thread exists and who it belongs to.
  const orgId = link.thread.organizationId;
  if (!orgId) {
    return { status: 'not_found' };
  }

  const canShare = await isFeatureEnabledQuery(orgId, 'publicThreadLinks');
  if (!canShare) {
    return { status: 'not_found' };
  }

  if (link.passwordHash) {
    if (cookieVerified) {
      // HMAC-signed cookie verified by caller — no need to re-check password
    } else if (!submittedPassword) {
      return { status: 'password_required' };
    } else {
      const valid = await bcrypt.compare(submittedPassword, link.passwordHash);
      if (!valid) {
        return { status: 'password_invalid' };
      }
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

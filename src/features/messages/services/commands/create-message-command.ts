'use server';

import {
  type Thread,
  Role,
  type MessageContentType,
  Source,
} from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { createVisitorEntry } from '@/app/lib/services/visitor';
import type {
  DbMessageDto,
  MessageAttachment,
  MessageDto,
} from '../../contracts/message.types';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '@/libs/crypto/thread-encryption';

function sanitizeAttachments(
  raw: MessageAttachment[] | undefined,
): MessageAttachment[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }

  const sanitized = raw
    .filter(
      (item): item is MessageAttachment =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.name === 'string' &&
        typeof item.type === 'string',
    )
    .map((item) => {
      const attachment: MessageAttachment = {
        name: item.name.slice(0, 500),
        size: typeof item.size === 'number' ? Math.max(0, item.size) : 0,
        type: item.type.slice(0, 100),
      };

      if (typeof item.sourceUrl === 'string' && item.sourceUrl.length > 0) {
        try {
          const url = new URL(item.sourceUrl);
          if (url.protocol === 'https:' || url.protocol === 'http:') {
            attachment.sourceUrl = url.toString();
          }
        } catch {
          // Invalid URL — omit sourceUrl
        }
      }

      if (typeof item.imageData === 'string' && item.imageData.length > 0) {
        attachment.imageData = item.imageData;
      }

      if (
        typeof item.documentData === 'string' &&
        item.documentData.length > 0
      ) {
        attachment.documentData = item.documentData;
      }

      return attachment;
    });

  return sanitized.length > 0 ? sanitized : undefined;
}

async function maybeEncryptContent(
  threadId: string,
  content: string,
): Promise<string> {
  if (!isEncryptionEnabled()) {
    return content;
  }

  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    select: { encryptedDek: true },
  });

  let dek: Buffer;

  if (thread.encryptedDek) {
    dek = await decryptThreadKey(thread.encryptedDek);
  } else {
    const key = await generateThreadKey();
    dek = key.plaintextDek;

    // Conditional update to avoid race condition: only set DEK if still null
    const result = await db.thread.updateMany({
      where: { id: threadId, encryptedDek: null },
      data: { encryptedDek: key.encryptedDek },
    });

    // Another request won the race — use their key instead
    if (result.count === 0) {
      const updated = await db.thread.findUniqueOrThrow({
        where: { id: threadId },
        select: { encryptedDek: true },
      });
      if (!updated.encryptedDek) {
        throw new Error('Failed to initialize thread encryption key');
      }
      dek = await decryptThreadKey(updated.encryptedDek);
    }
  }

  return encryptContent(content, dek);
}

export const createMessageInDbCommand = async ({
  threadId,
  message,
  role,
  visitorId,
  runId,
  messageType = 'TEXT',
  voiceDurationSeconds,
  attachments,
}: {
  threadId: Thread['id'];
  message: Omit<DbMessageDto, 'id' | 'role'>;
  role: Role;
  visitorId?: string;
  runId?: string;
  messageType?: MessageContentType;
  voiceDurationSeconds?: number;
  attachments?: MessageAttachment[];
}) => {
  const sanitizedAttachments = sanitizeAttachments(attachments);

  try {
    const encryptedContent = await maybeEncryptContent(
      threadId,
      message.content,
    );

    return await db.message.create({
      data: {
        threadId: threadId,
        content: encryptedContent,
        role,
        source: message.source ?? Source.UI,
        visitorId: visitorId,
        runId: runId,
        messageType: messageType,
        voiceDurationSeconds: voiceDurationSeconds,
        attachments: sanitizedAttachments,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create message in DB');
    throw error;
  }
};

export const createAndStoreMessageCommand = async ({
  prompt,
  threadId,
  visitorId,
  messageType = 'TEXT',
  voiceDurationSeconds,
  attachments,
}: {
  prompt: string;
  threadId: Thread['id'];
  visitorId?: string;
  messageType?: MessageContentType;
  voiceDurationSeconds?: number;
  attachments?: MessageAttachment[];
}): Promise<MessageDto> => {
  try {
    const trimmedPrompt = prompt.trim();

    const dbMessage = await createMessageInDbCommand({
      threadId: threadId,
      message: {
        content: trimmedPrompt,
      },
      role: Role.USER,
      visitorId,
      messageType,
      voiceDurationSeconds,
      attachments,
    });

    // Auto-set thread title from first user message if not already set
    try {
      await db.thread.updateMany({
        where: { id: threadId, title: null },
        data: {
          title:
            trimmedPrompt.length > 100
              ? `${trimmedPrompt.substring(0, 100)}...`
              : trimmedPrompt,
        },
      });
    } catch (titleError) {
      logger.error({ err: titleError }, 'Failed to auto-set thread title');
    }

    const savedAttachments = dbMessage.attachments as
      | MessageAttachment[]
      | null;

    if (visitorId) {
      try {
        createVisitorEntry(dbMessage, visitorId);
      } catch (error) {
        logger.error({ err: error }, 'Cannot create visitor entry');
      }
    }

    return {
      id: dbMessage.id,
      role: dbMessage.role,
      createdAt: dbMessage.createdAt.toISOString(),
      content: dbMessage.content,
      messageType: dbMessage.messageType,
      voiceDurationSeconds: dbMessage.voiceDurationSeconds,
      voicePlayed: dbMessage.voicePlayed,
      attachments: savedAttachments ?? undefined,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create and store message');
    throw error;
  }
};

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

      return attachment;
    });

  return sanitized.length > 0 ? sanitized : undefined;
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
  message: Omit<DbMessageDto, 'role'>;
  role: Role;
  visitorId?: string;
  runId?: string;
  messageType?: MessageContentType;
  voiceDurationSeconds?: number;
  attachments?: MessageAttachment[];
}) => {
  const sanitizedAttachments = sanitizeAttachments(attachments);

  try {
    return await db.message.create({
      data: {
        thread_id: threadId,
        content: message.content,
        role,
        source: message.source ?? Source.UI,
        visitor_id: visitorId,
        run_id: runId,
        message_type: messageType,
        voice_duration_seconds: voiceDurationSeconds,
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
    const dbMessage = await createMessageInDbCommand({
      threadId: threadId,
      message: {
        id: `msg_${Date.now()}`,
        content: prompt.trim(),
      },
      role: Role.USER,
      visitorId,
      messageType,
      voiceDurationSeconds,
      attachments,
    });

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
      public_id: dbMessage.public_id,
      role: dbMessage.role,
      created_at: dbMessage.created_at.toISOString(),
      content: dbMessage.content,
      message_type: dbMessage.message_type,
      voice_duration_seconds: dbMessage.voice_duration_seconds,
      voice_played: dbMessage.voice_played,
      attachments: savedAttachments ?? undefined,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create and store message');
    throw error;
  }
};

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
        attachments:
          attachments && attachments.length > 0 ? attachments : undefined,
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

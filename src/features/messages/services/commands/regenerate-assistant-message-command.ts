import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import type { MessageAttachment } from '@/features/messages/contracts/message.types';
import { handleCommandError } from '@/shared/utils/error-handling';
import { logger } from '@/app/lib/utils/logger';

export type RegenerateData = {
  prompt: string;
  attachments: MessageAttachment[];
};

export async function regenerateAssistantMessageCommand(
  threadId: string,
  orgId: string,
  _userId: string,
): Promise<OperationResult<RegenerateData>> {
  try {
    const thread = await db.thread.findFirst({
      where: { id: threadId, organizationId: orgId },
      include: {
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });

    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }

    const messages = thread.messages;

    const lastAssistantIdx = [...messages]
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === 'ASSISTANT')
      .at(-1)?.i;

    if (lastAssistantIdx === undefined) {
      return { success: false, error: 'No assistant message to regenerate' };
    }

    const lastUserIdx = [...messages]
      .map((m, i) => ({ m, i }))
      .filter(({ m, i }) => m.role === 'USER' && i < lastAssistantIdx)
      .at(-1)?.i;

    if (lastUserIdx === undefined) {
      return {
        success: false,
        error: 'No user message found before the last assistant message',
      };
    }

    const assistantMessage = messages[lastAssistantIdx];
    const userMessage = messages[lastUserIdx];

    await db.$transaction([
      db.message.delete({ where: { id: assistantMessage.id } }),
      db.message.delete({ where: { id: userMessage.id } }),
    ]);

    logger.info(
      {
        threadId,
        assistantMessageId: assistantMessage.id,
        userMessageId: userMessage.id,
      },
      'Regenerate: deleted assistant and user messages',
    );

    return {
      success: true,
      data: {
        prompt: userMessage.content,
        attachments: Array.isArray(userMessage.attachments)
          ? (userMessage.attachments as unknown[]).filter(
              (a): a is MessageAttachment => {
                if (typeof a !== 'object' || a === null) {return false;}
                const r = a as Record<string, unknown>;
                return (
                  typeof r.name === 'string' &&
                  typeof r.size === 'number' &&
                  typeof r.type === 'string' &&
                  (r.sourceUrl === undefined ||
                    typeof r.sourceUrl === 'string') &&
                  (r.imageData === undefined ||
                    typeof r.imageData === 'string') &&
                  (r.documentData === undefined ||
                    typeof r.documentData === 'string')
                );
              },
            )
          : [],
      },
    };
  } catch (error) {
    return handleCommandError(error, 'Failed to regenerate assistant message');
  }
}

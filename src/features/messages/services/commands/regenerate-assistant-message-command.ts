import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import type { MessageAttachment } from '@/features/messages/contracts/message.types';
import { handleCommandError } from '@/shared/utils/error-handling';

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
      where: { id: threadId, project: { organizationId: orgId } },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }

    const messages = thread.messages;

    // Find last ASSISTANT message
    const lastAssistantIdx = [...messages]
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === 'ASSISTANT')
      .at(-1)?.i;

    if (lastAssistantIdx === undefined) {
      return { success: false, error: 'No assistant message to regenerate' };
    }

    // Find USER message before last ASSISTANT
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

    // Hard-delete the ASSISTANT message
    await db.message.delete({ where: { id: assistantMessage.id } });

    return {
      success: true,
      data: {
        prompt: userMessage.content,
        attachments: (userMessage.attachments as MessageAttachment[]) ?? [],
      },
    };
  } catch (error) {
    return handleCommandError(error, 'Failed to regenerate assistant message');
  }
}

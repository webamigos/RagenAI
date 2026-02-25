'use server';

import db from '@ragenai/prisma-client';
import type { UIMessage } from '@ai-sdk/react';
import { logger } from '@/app/lib/utils/logger';

/**
 * Load existing thread messages and convert to AI SDK UIMessage format.
 */
export async function loadThreadMessages(
  threadId: string
): Promise<UIMessage[]> {
  try {
    const thread = await db.thread.findUnique({
      where: { public_id: threadId },
      select: { id: true },
    });

    if (!thread) {
      return [];
    }

    const messages = await db.message.findMany({
      where: { thread_id: thread.id },
      select: {
        public_id: true,
        role: true,
        content: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    return messages.map((msg) => ({
      id: msg.public_id,
      role: msg.role === 'USER' ? ('user' as const) : ('assistant' as const),
      parts: [{ type: 'text' as const, text: msg.content }],
    }));
  } catch (error) {
    logger.error({ err: error }, 'Error loading thread messages');
    return [];
  }
}

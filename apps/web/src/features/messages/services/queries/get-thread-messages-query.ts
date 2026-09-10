'use server';

import { type Thread } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type {
  MessageAttachment,
  MessageMetadata,
} from '../../contracts/message.types';
import { decryptMessageContents } from '@ragenai/crypto';

export const getThreadMessagesQuery = async (
  threadId: Thread['id'],
  visitorId: Thread['visitorId'],
) => {
  try {
    const thread = await db.thread.findFirst({
      where: { id: threadId, visitorId: visitorId },
      select: {
        id: true,
        encryptedDek: true,
        mentionedProjectId: true,
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!thread) {
      return { messages: [], threadContext: null };
    }

    const rawMessages = await db.message.findMany({
      where: { threadId: thread.id },
      select: {
        id: true,
        createdAt: true,
        content: true,
        role: true,
        runId: true,
        rate: true,
        voiceDurationSeconds: true,
        messageType: true,
        voicePlayed: true,
        attachments: true,
        metadata: true,
        // What each answer was grounded in, so a reopened thread still shows
        // its sources. Ordered by rank, which is the order the sources block
        // renders — best first.
        documentRetrievals: {
          select: {
            fileId: true,
            rank: true,
            snippet: true,
            file: { select: { fileName: true } },
          },
          orderBy: { rank: 'asc' as const },
        },
      },
      orderBy: [
        {
          createdAt: 'asc',
        },
      ],
    });

    let messages;
    try {
      messages = await decryptMessageContents(rawMessages, thread.encryptedDek);
    } catch (error) {
      logger.error(
        { err: error, threadId: thread.id },
        'Failed to decrypt thread messages',
      );
      messages = rawMessages;
    }

    // Snippets were written under the same key as the messages beside them,
    // so they come back the same way. Separately, though: a failure here must
    // not take the conversation with it. A thread whose source quotes cannot
    // be read is still a thread worth showing, and the sources block already
    // renders nothing when there is nothing to render.
    messages = await Promise.all(
      messages.map(async (message) => ({
        ...message,
        documentRetrievals: await decryptRetrievalSnippets(
          message.documentRetrievals,
          thread.encryptedDek,
          thread.id,
        ),
      })),
    );

    // Get mentioned project details if exists
    let mentionedProject = null;
    if (thread.mentionedProjectId) {
      try {
        mentionedProject = await db.project.findUnique({
          where: { id: thread.mentionedProjectId },
          select: {
            id: true,
            title: true,
          },
        });

        // If mentioned project doesn't exist, log warning but continue
        if (!mentionedProject) {
          logger.warn(
            {
              threadId: thread.id,
              mentionedProjectId: thread.mentionedProjectId,
            },
            'Mentioned project not found, will fallback to regular thread project',
          );
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            threadId: thread.id,
            mentionedProjectId: thread.mentionedProjectId,
          },
          'Error fetching mentioned project, will fallback to regular thread project',
        );
        // mentionedProject stays null, system will use regular project
      }
    }

    // Convert Date objects to ISO strings for serialization
    return {
      messages: messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
        attachments:
          (message.attachments as MessageAttachment[] | null) ?? undefined,
        metadata: (message.metadata as MessageMetadata | null) ?? undefined,
      })),
      threadContext: {
        project: thread.project,
        mentionedProject,
        mentionedProjectId: thread.mentionedProjectId,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch messages from DB');
    throw error;
  }
};

type RetrievalRow = {
  fileId: string;
  rank: number;
  snippet: string | null;
  file: { fileName: string | null } | null;
};

/**
 * Decrypts the quotes on one message's retrievals.
 *
 * Rows with no snippet pass through untouched: every row written before gap 5
 * has none, and so does any chunk that had no text. `decryptMessageContents`
 * is reused rather than reimplemented because these were written by the same
 * function that wrote the message — the symmetry is the point.
 *
 * A failure is swallowed and the quotes dropped. The conversation is the
 * thing the reader came for; a source card without its quote still names the
 * document, and an unreadable snippet should not blank the page.
 */
async function decryptRetrievalSnippets(
  retrievals: RetrievalRow[],
  encryptedDek: string | null | undefined,
  threadId: string,
): Promise<RetrievalRow[]> {
  const withSnippets = retrievals.filter(
    (row): row is RetrievalRow & { snippet: string } => row.snippet !== null,
  );
  if (withSnippets.length === 0) {
    return retrievals;
  }

  try {
    const decrypted = await decryptMessageContents(
      withSnippets.map((row) => ({ ...row, content: row.snippet })),
      encryptedDek,
    );
    const byFileId = new Map(decrypted.map((row) => [row.fileId, row.content]));

    return retrievals.map((row) =>
      byFileId.has(row.fileId)
        ? { ...row, snippet: byFileId.get(row.fileId) ?? null }
        : row,
    );
  } catch (error) {
    logger.error(
      { err: error, threadId },
      'Failed to decrypt source snippets — showing sources without quotes',
    );
    return retrievals.map((row) => ({ ...row, snippet: null }));
  }
}

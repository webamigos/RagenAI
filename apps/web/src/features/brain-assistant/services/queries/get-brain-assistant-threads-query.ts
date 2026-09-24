import 'server-only';

import { decryptMessageContents } from '@ragenai/crypto';
import db from '@ragenai/prisma-client';

import type {
  BrainAssistantMessageView,
  BrainAssistantThreadSummary,
} from '../../contracts/brain-assistant.types';
import { decodeStoredMessage } from '../../utils/stored-message';

/** Conversations the history list shows. */
export const THREADS_SHOWN = 20;
/** Earlier turns the model is given; screen context is always sent fresh. */
export const HISTORY_TURNS = 12;

type Owner = { orgId: string; userId: string };

/**
 * The person's own conversations with the assistant, newest first (spec C1).
 *
 * Scoped three ways — organization, owner and kind — so a chat thread is
 * never listed here and a Brain conversation is never someone else's. Titles
 * are stored under the thread's key like its messages, and decrypted here.
 */
export async function getBrainAssistantThreadsQuery({
  orgId,
  userId,
}: Owner): Promise<BrainAssistantThreadSummary[]> {
  const threads = await db.thread.findMany({
    where: {
      organizationId: orgId,
      visitorId: userId,
      kind: 'BRAIN_OPERATOR',
      messages: { some: {} },
    },
    orderBy: { createdAt: 'desc' },
    take: THREADS_SHOWN,
    select: { id: true, title: true, createdAt: true, encryptedDek: true },
  });
  return Promise.all(
    threads.map(async (t) => {
      const [title] = await decryptMessageContents(
        [{ content: t.title ?? '' }],
        t.encryptedDek,
      );
      return {
        id: t.id,
        title: title?.content ?? '',
        createdAt: t.createdAt.toISOString(),
      };
    }),
  );
}

/**
 * One conversation, decrypted, or null when it is not this person's Brain
 * conversation in this organization.
 */
export async function getBrainAssistantThreadQuery(
  owner: Owner,
  threadId: string,
): Promise<{ id: string; messages: BrainAssistantMessageView[] } | null> {
  const thread = await db.thread.findFirst({
    where: {
      id: threadId,
      organizationId: owner.orgId,
      visitorId: owner.userId,
      kind: 'BRAIN_OPERATOR',
    },
    select: {
      id: true,
      encryptedDek: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });
  if (!thread) {
    return null;
  }
  const messages = await decryptMessageContents(
    thread.messages,
    thread.encryptedDek,
  );
  return {
    id: thread.id,
    messages: messages.map((m) => {
      if (m.role === 'ASSISTANT') {
        const { text, proposals, refused } = decodeStoredMessage(m.content);
        return {
          id: m.id,
          role: 'assistant' as const,
          text,
          proposals,
          refused,
          createdAt: m.createdAt.toISOString(),
        };
      }
      return {
        id: m.id,
        role: 'user' as const,
        text: m.content,
        proposals: [],
        refused: false,
        createdAt: m.createdAt.toISOString(),
      };
    }),
  };
}

/**
 * The last turns as the model reads them: text only. A proposal is reported
 * by what it was and what became of it, so the model knows what was applied
 * without being handed the card to re-emit.
 */
export function historyForModel(
  messages: BrainAssistantMessageView[],
): { role: 'user' | 'assistant'; content: string }[] {
  return messages.slice(-HISTORY_TURNS).map((m) => {
    if (m.refused) {
      return { role: m.role, content: '[answer withheld by a guardrail]' };
    }
    if (m.role === 'user' || m.proposals.length === 0) {
      return { role: m.role, content: m.text };
    }
    const notes = m.proposals.map(
      (p) =>
        `[proposal ${p.action}: ${p.outcome?.status ?? 'not decided yet'}]`,
    );
    return { role: m.role, content: `${m.text}\n${notes.join('\n')}` };
  });
}

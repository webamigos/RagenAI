import 'server-only';

import { decryptMessageContents } from '@ragenai/crypto';
import db from '@ragenai/prisma-client';

import { Role, Source } from '@/generated/prisma/client';
import { createMessageInDbCommand } from '@/features/messages/services/commands/create-message-command';
import { maybeEncryptContent } from '@/features/messages/services/thread-content-encryption';

import type {
  BrainProposal,
  ProposalOutcome,
} from '../../contracts/brain-assistant.types';
import {
  decodeStoredMessage,
  encodeStoredMessage,
  threadTitle,
} from '../../utils/stored-message';

type Owner = { orgId: string; userId: string };

/**
 * A new conversation with the assistant (spec C1): a `Thread` of kind
 * `BRAIN_OPERATOR`, owned by the person, in no project — so no chat list,
 * search or export ever returns it.
 *
 * The title is the first question, and it is thread-derived text, so it is
 * written under the thread's key through the same function as every message
 * (ADR-42) rather than as the plaintext the chat's titles are.
 */
export async function createBrainAssistantThreadCommand(
  owner: Owner,
  question: string,
): Promise<string> {
  const thread = await db.thread.create({
    data: {
      organizationId: owner.orgId,
      visitorId: owner.userId,
      kind: 'BRAIN_OPERATOR',
      source: Source.UI,
    },
    select: { id: true },
  });
  const title = await maybeEncryptContent(thread.id, threadTitle(question));
  await db.thread.updateMany({
    where: { id: thread.id, organizationId: owner.orgId },
    data: { title },
  });
  return thread.id;
}

/** Whether `threadId` is this person's Brain conversation in this organization. */
export async function ownsBrainAssistantThread(
  owner: Owner,
  threadId: string,
): Promise<boolean> {
  const found = await db.thread.findFirst({
    where: {
      id: threadId,
      organizationId: owner.orgId,
      visitorId: owner.userId,
      kind: 'BRAIN_OPERATOR',
    },
    select: { id: true },
  });
  return found !== null;
}

/** The operator's question, stored as the chat stores one. */
export async function storeBrainAssistantQuestionCommand(
  owner: Owner,
  threadId: string,
  question: string,
): Promise<string> {
  const message = await createMessageInDbCommand({
    threadId,
    message: { content: question },
    role: Role.USER,
    visitorId: owner.userId,
  });
  return message.id;
}

/** The answer and its proposals, as one encrypted document. */
export async function storeBrainAssistantAnswerCommand(
  owner: Owner,
  threadId: string,
  text: string,
  proposals: BrainProposal[],
  options: { refused?: boolean } = {},
): Promise<string> {
  const message = await createMessageInDbCommand({
    threadId,
    message: { content: encodeStoredMessage(text, proposals, options) },
    role: Role.ASSISTANT,
    visitorId: owner.userId,
  });
  return message.id;
}

/**
 * Read one stored proposal, or null when the conversation, the message or the
 * proposal is not this person's.
 */
export async function readStoredProposalQuery(
  owner: Owner,
  threadId: string,
  messageId: string,
  proposalId: string,
): Promise<BrainProposal | null> {
  const found = await readAssistantMessage(owner, threadId, messageId);
  return found?.proposals.find((p) => p.id === proposalId) ?? null;
}

/**
 * Record what became of a proposal, so a reopened conversation shows it.
 *
 * Written only if the proposal is still undecided: two tabs applying the same
 * card record the first outcome, and the second is told `already-decided`.
 * The message is re-encrypted as a whole, through the same function.
 */
export async function recordProposalOutcomeCommand(
  owner: Owner,
  threadId: string,
  messageId: string,
  proposalId: string,
  outcome: ProposalOutcome,
): Promise<BrainProposal | 'not-found' | 'already-decided'> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM messages m
      JOIN threads t ON t.id = m.thread_id
      WHERE m.id = ${messageId}::uuid AND t.id = ${threadId}::uuid
        AND t.organization_id = ${owner.orgId}
        AND t.visitor_id = ${owner.userId}
        AND t.kind = 'BRAIN_OPERATOR'
        AND m.role = 'ASSISTANT'
      FOR UPDATE OF m
    `;
    if (locked.length === 0) {
      return 'not-found' as const;
    }
    const found = await readAssistantMessage(owner, threadId, messageId, tx);
    const index = found?.proposals.findIndex((p) => p.id === proposalId) ?? -1;
    if (!found || index === -1) {
      return 'not-found' as const;
    }
    const current = found.proposals[index]!;
    if (current.outcome !== null) {
      return 'already-decided' as const;
    }
    const updated = { ...current, outcome } as BrainProposal;
    const proposals = found.proposals.map((p, i) =>
      i === index ? updated : p,
    );
    const content = await maybeEncryptContent(
      threadId,
      encodeStoredMessage(found.text, proposals, { refused: found.refused }),
    );
    await tx.message.updateMany({
      where: { id: messageId, threadId },
      data: { content },
    });
    return updated;
  });
}

type Tx = Parameters<
  Extract<Parameters<typeof db.$transaction>[0], (...args: never[]) => unknown>
>[0];

async function readAssistantMessage(
  owner: Owner,
  threadId: string,
  messageId: string,
  client: Tx | typeof db = db,
) {
  const thread = await client.thread.findFirst({
    where: {
      id: threadId,
      organizationId: owner.orgId,
      visitorId: owner.userId,
      kind: 'BRAIN_OPERATOR',
    },
    select: {
      encryptedDek: true,
      messages: {
        where: { id: messageId, role: Role.ASSISTANT },
        select: { content: true },
      },
    },
  });
  if (!thread || thread.messages.length === 0) {
    return null;
  }
  const [message] = await decryptMessageContents(
    thread.messages,
    thread.encryptedDek,
  );
  return message ? decodeStoredMessage(message.content) : null;
}

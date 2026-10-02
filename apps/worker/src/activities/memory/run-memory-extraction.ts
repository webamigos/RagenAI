import {
  decryptDocumentContent,
  openOwnedRows,
  resolveOwnerKeyForTransaction,
  sealOwnedContent,
} from '@ragenai/crypto';
import type {
  MemoryExtractPayload,
  MemoryExtractResult,
  MemoryExtractSkip,
} from '@ragenai/jobs';
import {
  CHAT_TURN_STEP,
  evaluateCeilings,
  usageMonthStart,
} from '@ragenai/platform-contracts';
import { type z } from 'zod';

import { MEMORY_EXTRACT_MODEL } from '../../consts.js';
import { db } from '../../services/db/db.js';
import { getPrisma } from '../../services/db/prisma.js';
import { getChatModelForOrg } from '../../services/llm/provider.js';
import { logger } from '../../services/logger.js';
import { resolveOrgFeatures } from '../../services/org-features.js';
import { structuredGenerator } from '../brain/structured-generator.js';
import {
  extractionAnswerSchema,
  memoryWriteGate,
  parseOperations,
  planMemoryApply,
  planWritesNothing,
  type CurrentMemory,
  type MemoryPlan,
} from './extraction-plan.js';
import { MEMORY_EXTRACTION_SYSTEM, memoryExtractionPrompt } from './prompt.js';

/**
 * One memory extraction, start to finish (spec
 * 2026-09-27-personal-memory-across-threads, C1, "Writing: a job after each
 * turn"). One activity rather than several steps on purpose: the decrypted
 * question and memories never cross a step boundary, where a runtime would
 * persist them. Retried whole; the job id makes a repeated start one job, and
 * the write is idempotent enough (an identical ADD is skipped).
 *
 * The only place in apps/worker that touches the three memory models
 * (`memory-rows-are-read-through-one-module.test.ts`). Nothing here logs
 * content: not the question, not a memory, not the model's answer.
 */
export async function runMemoryExtraction(
  payload: MemoryExtractPayload,
): Promise<MemoryExtractResult> {
  const { orgId, userId, threadId, messageId, epoch } = payload;
  const prisma = getPrisma();
  const skip = (reason: MemoryExtractSkip, dropped = 0) => {
    logger.info({ orgId, messageId, reason }, 'memoryExtract: skipped');
    return { skipped: reason, added: 0, updated: 0, deleted: 0, dropped };
  };

  // The enqueue-time gate, read again before any model call.
  const [features, profile, member] = await Promise.all([
    resolveOrgFeatures(orgId),
    prisma.userMemoryProfile.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      select: { extractionEnabled: true, epoch: true, encryptedDek: true },
    }),
    prisma.member.findFirst({
      where: { organizationId: orgId, userId },
      select: { id: true },
    }),
  ]);
  const early = memoryWriteGate({
    featureOn: features.personalMemory.value,
    isMember: member !== null,
    profile,
    enqueuedEpoch: epoch,
  });
  if (early) {
    return skip(early);
  }

  // "A limit is a call site" (AGENTS.md): no extraction over the ceiling.
  if (await isOverUsageCeiling(orgId)) {
    return skip('ceiling');
  }

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, organizationId: orgId },
    select: { encryptedDek: true },
  });
  if (!thread) {
    return skip('not-member');
  }
  const question = payload.questionEncrypted
    ? await decryptDocumentContent(payload.question, thread.encryptedDek)
    : payload.question;

  const keyStore = {
    load: async () =>
      (
        await prisma.userMemoryProfile.findUnique({
          where: { organizationId_userId: { organizationId: orgId, userId } },
          select: { encryptedDek: true },
        })
      )?.encryptedDek ?? null,
  };

  const now = new Date();
  const rows = await prisma.userMemory.findMany({
    where: {
      organizationId: orgId,
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      publicId: true,
      content: true,
      isEncrypted: true,
      version: true,
      updatedAt: true,
    },
  });
  const opened = await openOwnedRows(rows, keyStore);
  const current: CurrentMemory[] = opened.map((row, i) => ({
    ref: `m${i + 1}`,
    publicId: row.publicId,
    content: row.content,
    version: row.version,
    updatedAt: row.updatedAt,
  }));

  const startedAt = Date.now();
  const generate = structuredGenerator(
    await getChatModelForOrg(orgId, MEMORY_EXTRACT_MODEL),
  );
  const answer = await generate({
    system: MEMORY_EXTRACTION_SYSTEM,
    prompt: memoryExtractionPrompt(current, question),
    schema: extractionAnswerSchema as z.ZodType,
  });
  const { inputTokens, outputTokens } = answer.usage;
  if (inputTokens + outputTokens > 0) {
    await db.trackAiUsage({
      organizationId: orgId,
      userId,
      threadId,
      step: 'MEMORY',
      provider: 'litellm',
      model: MEMORY_EXTRACT_MODEL,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      durationMs: Date.now() - startedAt,
      metadata: { kind: 'memory_extract', messageId },
    });
  }

  const parsed = parseOperations(answer.object);
  if (!parsed) {
    return skip('unparseable');
  }
  const plan = planMemoryApply(current, parsed.operations);
  const dropped = parsed.dropped + plan.dropped;
  if (planWritesNothing(plan)) {
    // Counts only, never content. A run that drops every operation looks
    // like "nothing to remember" unless it says so — which is how a parser
    // that rejected every answer stayed invisible.
    if (dropped > 0) {
      logger.info(
        { orgId, messageId, dropped },
        'memoryExtract: every operation dropped',
      );
    }
    return { skipped: null, added: 0, updated: 0, deleted: 0, dropped };
  }

  // Up to two tries: a lost first-key race rolls the transaction back, and
  // the second resolves the winner's key and encrypts under it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const key = await resolveOwnerKeyForTransaction(keyStore);
    if (key.status === 'unavailable') {
      logger.warn(
        { orgId, messageId, err: { name: (key.error as Error)?.name } },
        'memoryExtract: the owner key is unavailable; nothing written',
      );
      return skip('key-unavailable', dropped);
    }
    const outcome = await applyPlan({
      orgId,
      userId,
      threadId,
      messageId,
      epoch,
      plan,
      key,
    });
    if (outcome !== 'key-race') {
      return typeof outcome === 'string'
        ? skip(outcome, dropped)
        : { skipped: null, ...outcome, dropped };
    }
  }
  return skip('key-unavailable', dropped);
}

type ApplyKey = Exclude<
  Awaited<ReturnType<typeof resolveOwnerKeyForTransaction>>,
  { status: 'unavailable' }
>;

class KeyRace extends Error {}

/**
 * Everything that writes, in one transaction (spec "Apply"): membership,
 * the profile upsert, the key's conditional store, the profile lock, the
 * re-check, then the operations and their change rows. A failed check rolls
 * the upsert back too, so a queued job cannot recreate a removed member's
 * profile. Contents are sealed before the transaction opens.
 */
async function applyPlan({
  orgId,
  userId,
  threadId,
  messageId,
  epoch,
  plan,
  key,
}: {
  orgId: string;
  userId: string;
  threadId: string;
  messageId: string;
  epoch: number;
  plan: MemoryPlan;
  key: ApplyKey;
}): Promise<
  | { added: number; updated: number; deleted: number }
  | MemoryExtractSkip
  | 'key-race'
> {
  const seal = (text: string) => sealOwnedContent(text, key);
  const sealed = {
    adds: plan.adds.map((add) => ({ ...add, ...seal(add.content) })),
    updates: plan.updates.map((update) => ({
      ...update,
      next: seal(update.content),
      previous: seal(update.memory.content),
    })),
    deletes: plan.deletes.map((memory) => ({
      memory,
      previous: seal(memory.content),
    })),
  };
  const owner = { organizationId: orgId, userId };
  const prisma = getPrisma();

  try {
    return await prisma.$transaction(async (tx) => {
      const member = await tx.member.findFirst({
        where: owner,
        select: { id: true },
      });
      if (!member) {
        return 'not-member' as const;
      }

      const profile = await tx.userMemoryProfile.upsert({
        where: { organizationId_userId: owner },
        create: owner,
        update: {},
        select: { id: true },
      });
      if (key.status === 'key' && key.newEncryptedDek) {
        const { count } = await tx.userMemoryProfile.updateMany({
          where: { id: profile.id, encryptedDek: null },
          data: { encryptedDek: key.newEncryptedDek },
        });
        if (count === 0) {
          throw new KeyRace();
        }
      }

      const [locked] = await tx.$queryRaw<
        { extraction_enabled: boolean; epoch: number }[]
      >`SELECT extraction_enabled, epoch FROM user_memory_profiles WHERE id = ${profile.id} AND organization_id = ${orgId} AND user_id = ${userId} FOR UPDATE`;
      const features = await resolveOrgFeatures(orgId);
      const gate = memoryWriteGate({
        featureOn: features.personalMemory.value,
        isMember: true,
        profile: locked
          ? {
              extractionEnabled: locked.extraction_enabled,
              epoch: locked.epoch,
            }
          : null,
        enqueuedEpoch: epoch,
      });
      if (gate) {
        // Rolls the upsert back with it.
        throw new GateClosed(gate);
      }

      let added = 0;
      let updated = 0;
      let deleted = 0;
      for (const update of sealed.updates) {
        const { count } = await tx.userMemory.updateMany({
          where: {
            ...owner,
            publicId: update.memory.publicId,
            // The user's own edit made mid-job wins.
            updatedAt: update.memory.updatedAt,
          },
          data: {
            content: update.next.content,
            isEncrypted: update.next.isEncrypted,
            version: { increment: 1 },
            sourceThreadId: threadId,
            expiresAt: update.expiresAt,
          },
        });
        if (count === 1) {
          updated += 1;
          await tx.userMemoryChange.create({
            data: {
              ...owner,
              profileId: profile.id,
              messageId,
              sourceThreadId: threadId,
              memoryPublicId: update.memory.publicId,
              operation: 'UPDATE',
              previousContent: update.previous.content,
              newContent: update.next.content,
              isEncrypted: update.next.isEncrypted,
              resultVersion: update.memory.version + 1,
            },
          });
        }
      }
      for (const del of sealed.deletes) {
        const { count } = await tx.userMemory.deleteMany({
          where: {
            ...owner,
            publicId: del.memory.publicId,
            updatedAt: del.memory.updatedAt,
          },
        });
        if (count === 1) {
          deleted += 1;
          await tx.userMemoryChange.create({
            data: {
              ...owner,
              profileId: profile.id,
              messageId,
              sourceThreadId: threadId,
              memoryPublicId: del.memory.publicId,
              operation: 'DELETE',
              previousContent: del.previous.content,
              isEncrypted: del.previous.isEncrypted,
              resultVersion: null,
            },
          });
        }
      }
      for (const add of sealed.adds) {
        const memory = await tx.userMemory.create({
          data: {
            ...owner,
            profileId: profile.id,
            content: add.content,
            isEncrypted: add.isEncrypted,
            sourceThreadId: threadId,
            expiresAt: add.expiresAt,
          },
          select: { publicId: true },
        });
        added += 1;
        await tx.userMemoryChange.create({
          data: {
            ...owner,
            profileId: profile.id,
            messageId,
            sourceThreadId: threadId,
            memoryPublicId: memory.publicId,
            operation: 'ADD',
            newContent: add.content,
            isEncrypted: add.isEncrypted,
            resultVersion: 1,
          },
        });
      }
      return { added, updated, deleted };
    });
  } catch (error) {
    if (error instanceof KeyRace) {
      return 'key-race';
    }
    if (error instanceof GateClosed) {
      return error.reason;
    }
    throw error;
  }
}

class GateClosed extends Error {
  constructor(readonly reason: MemoryExtractSkip) {
    super(reason);
  }
}

/** The org's monthly ceilings, read the way the chat surfaces read them (B1). */
async function isOverUsageCeiling(orgId: string): Promise<boolean> {
  const prisma = getPrisma();
  const monthStart = usageMonthStart();
  const [settings, aggregates, chatMessages] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId: orgId },
      select: {
        monthlyTokenLimit: true,
        monthlyCostLimitCents: true,
        monthlyMessageLimit: true,
      },
    }),
    prisma.aiUsage.aggregate({
      where: { organizationId: orgId, createdAt: { gte: monthStart } },
      _sum: { totalTokens: true, estimatedCost: true },
    }),
    prisma.aiUsage.count({
      where: {
        organizationId: orgId,
        createdAt: { gte: monthStart },
        step: CHAT_TURN_STEP,
      },
    }),
  ]);
  const { exceeded } = evaluateCeilings(
    {
      monthlyTokenLimit:
        settings?.monthlyTokenLimit != null
          ? Number(settings.monthlyTokenLimit)
          : null,
      monthlyCostLimitCents: settings?.monthlyCostLimitCents ?? null,
      monthlyMessageLimit: settings?.monthlyMessageLimit ?? null,
    },
    {
      totalTokens: aggregates._sum.totalTokens,
      totalCostDollars: aggregates._sum.estimatedCost,
      chatMessages,
    },
  );
  // The message ceiling counts chat turns, which an extraction is not; it is
  // spend that an extraction adds to, so only tokens and cost stop it.
  return exceeded.includes('tokens') || exceeded.includes('cost');
}

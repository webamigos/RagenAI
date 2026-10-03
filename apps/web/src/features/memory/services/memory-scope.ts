import 'server-only';

import db from '@ragenai/prisma-client';
import {
  openOwnedRows,
  resolveOwnerKeyForWrite,
  sealOwnedContent,
  type OwnerKeyStore,
} from '@ragenai/crypto';

import {
  getCurrentUserId,
  getOrgIdFromAuthOrThrow,
} from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { NotFoundException, UnauthorizedException } from '@/libs/utils/errors';
import {
  MEMORY_MAX_ENTRIES,
  memoryContentSchema,
  memoryPublicIdSchema,
  memoryThreadIdSchema,
  type MemoryChangeView,
  type MemorySettings,
  type ThreadMemoryChanges,
  type UndoMemoryChangeResult,
  type UserMemoryView,
} from '../contracts/memory.types';
import { memoryChangeState } from '../utils/memory-change-state';

/**
 * The only module in apps/web that reads or writes `userMemoryProfile`,
 * `userMemory` and `userMemoryChange` (spec
 * 2026-09-27-personal-memory-across-threads, "The per-user boundary is
 * enforced in one place"; `tests/architecture/memory-rows-are-read-through-one-module.test.ts`).
 *
 * The boundary is the (organization, user) pair. The tenant-scope guard sees
 * a missing `organizationId` and only warns; it cannot see a missing
 * `userId`, which is the half this feature depends on. So every function
 * takes a `MemoryOwner`, and a `MemoryOwner` is built in one place, from the
 * session — never from an argument a caller passes.
 */

declare const memoryOwnerBrand: unique symbol;

/** Whose memories a call may touch. Only `memoryOwnerFromSession` makes one. */
export interface MemoryOwner {
  readonly organizationId: string;
  readonly userId: string;
  readonly [memoryOwnerBrand]: true;
}

export async function memoryOwnerFromSession(): Promise<MemoryOwner> {
  const organizationId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedException('No signed-in user');
  }
  return { organizationId, userId } as MemoryOwner;
}

const ownerWhere = (owner: MemoryOwner) => ({
  organizationId: owner.organizationId,
  userId: owner.userId,
});

const profileKey = (owner: MemoryOwner) => ({
  organizationId_userId: ownerWhere(owner),
});

/**
 * The owner's profile row, created on first use. Two first writes at once can
 * both take the create branch, and the loser gets a unique violation on
 * (organization, user) — the row it wanted now exists, so it reads it.
 */
async function upsertProfile(owner: MemoryOwner): Promise<{ id: number }> {
  try {
    return await db.userMemoryProfile.upsert({
      where: profileKey(owner),
      create: ownerWhere(owner),
      update: {},
      select: { id: true },
    });
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2002') {
      throw err;
    }
    return db.userMemoryProfile.findUniqueOrThrow({
      where: profileKey(owner),
      select: { id: true },
    });
  }
}

/**
 * The owner key's storage: the profile's `encryptedDek`, set once. A writer
 * passes the `epoch` it read, so a key generated before a concurrent "forget
 * everything" is not stored after it: that would leave a key on a profile the
 * user has just had cleared.
 */
function ownerKeyStore(
  owner: MemoryOwner,
  expectedEpoch?: number,
): OwnerKeyStore {
  return {
    load: async () =>
      (
        await db.userMemoryProfile.findUnique({
          where: profileKey(owner),
          select: { encryptedDek: true },
        })
      )?.encryptedDek ?? null,
    saveIfAbsent: async (encryptedDek) => {
      const profile = await upsertProfile(owner);
      const { count } = await db.userMemoryProfile.updateMany({
        where: {
          id: profile.id,
          ...ownerWhere(owner),
          encryptedDek: null,
          ...(expectedEpoch === undefined ? {} : { epoch: expectedEpoch }),
        },
        data: { encryptedDek },
      });
      return count === 1;
    },
  };
}

/** The owner's memories, newest first, decrypted; expired ones are left out. */
export async function listMemories(
  owner: MemoryOwner,
  now: Date = new Date(),
): Promise<UserMemoryView[]> {
  const rows = await db.userMemory.findMany({
    where: {
      ...ownerWhere(owner),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      content: true,
      isEncrypted: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      sourceThread: { select: { id: true, title: true } },
    },
  });

  const opened = await openOwnedRows(rows, ownerKeyStore(owner));
  return opened.map(({ isEncrypted: _isEncrypted, ...row }) => row);
}

/**
 * What the chat needs to decide whether to enqueue an extraction: the user's
 * switch, and the epoch the job carries so a later "forget everything" or
 * opt-out fences it. No profile yet means on, at epoch 0.
 */
export async function getExtractionState(
  owner: MemoryOwner,
): Promise<{ extractionEnabled: boolean; epoch: number }> {
  const profile = await db.userMemoryProfile.findUnique({
    where: profileKey(owner),
    select: { extractionEnabled: true, epoch: true },
  });
  return {
    extractionEnabled: profile?.extractionEnabled ?? true,
    epoch: profile?.epoch ?? 0,
  };
}

/** How many memories the owner has, expired ones included: what erasure would delete. */
export async function countMemories(owner: MemoryOwner): Promise<number> {
  return db.userMemory.count({ where: ownerWhere(owner) });
}

export async function getMemorySettings(
  owner: MemoryOwner,
): Promise<MemorySettings> {
  const profile = await db.userMemoryProfile.findUnique({
    where: profileKey(owner),
    select: { extractionEnabled: true },
  });
  return { extractionEnabled: profile?.extractionEnabled ?? true };
}

/**
 * Replace one memory's text. Another user's `publicId` — in this organization
 * or any other — matches nothing and is `NotFound`, never a write. Refused
 * when encryption is on and the owner key cannot be had: a memory is never
 * stored in plaintext beside encrypted threads (ADR-42, as amended).
 */
export async function updateMemory(
  owner: MemoryOwner,
  publicId: string,
  content: string,
): Promise<void> {
  const id = memoryPublicIdSchema.parse(publicId);
  const text = memoryContentSchema.parse(content);

  const memory = await db.userMemory.findFirst({
    where: { publicId: id, ...ownerWhere(owner) },
    select: { id: true, version: true, profile: { select: { epoch: true } } },
  });
  if (!memory) {
    throw new NotFoundException('Memory not found');
  }

  const key = await resolveOwnerKeyForWrite(
    ownerKeyStore(owner, memory.profile.epoch),
  );
  if (key.status === 'unavailable') {
    logger.warn(
      { err: key.error },
      'updateMemory: the owner key is unavailable; nothing written',
    );
    throw new Error('Memory could not be saved; try again later');
  }
  const sealed = sealOwnedContent(text, key);

  // Conditional on the version read above, so an extraction that changed
  // the row in between is not overwritten blind; the caller retries.
  const { count } = await db.userMemory.updateMany({
    where: { id: memory.id, ...ownerWhere(owner), version: memory.version },
    data: { ...sealed, version: { increment: 1 } },
  });
  if (count === 0) {
    throw new Error('The memory changed while it was being edited');
  }
}

/** Delete one memory. Another user's `publicId` is `NotFound`. */
export async function deleteMemory(
  owner: MemoryOwner,
  publicId: string,
): Promise<void> {
  const id = memoryPublicIdSchema.parse(publicId);
  const { count } = await db.userMemory.deleteMany({
    where: { publicId: id, ...ownerWhere(owner) },
  });
  if (count === 0) {
    throw new NotFoundException('Memory not found');
  }
}

/**
 * "Forget everything": every memory and change row goes, and the profile's
 * key is cleared, in one transaction. The profile row stays, so a user who
 * switched extraction off stays opted out, and its `epoch` moves on so a job
 * still queued from before writes nothing. A row delete, not a crypto-shred.
 */
export async function forgetAllMemories(owner: MemoryOwner): Promise<void> {
  await db.$transaction([
    db.userMemory.deleteMany({ where: ownerWhere(owner) }),
    db.userMemoryChange.deleteMany({ where: ownerWhere(owner) }),
    db.userMemoryProfile.updateMany({
      where: ownerWhere(owner),
      data: { encryptedDek: null, epoch: { increment: 1 } },
    }),
  ]);
}

/**
 * The user's switch. Turning it off keeps existing memories — the page offers
 * "forget everything" beside it — and moves the `epoch` on, so a job enqueued
 * before the switch writes nothing.
 */
export async function setMemoryExtraction(
  owner: MemoryOwner,
  enabled: boolean,
): Promise<void> {
  await db.userMemoryProfile.upsert({
    where: profileKey(owner),
    create: { ...ownerWhere(owner), extractionEnabled: enabled },
    update: enabled
      ? { extractionEnabled: true }
      : { extractionEnabled: false, epoch: { increment: 1 } },
  });
}

/**
 * What each turn of one thread changed in the owner's memory, for the line
 * under its answer, keyed by the assistant message. A thread that is not the
 * owner's matches no change row — they are written under the owner's
 * (organization, user) — so it reads as a thread with no changes. Change
 * rows live 30 days (`memoryPurge`), so an older turn shows no line.
 */
export async function listThreadMemoryChanges(
  owner: MemoryOwner,
  threadId: string,
): Promise<ThreadMemoryChanges> {
  const thread = memoryThreadIdSchema.parse(threadId);
  const changes = await db.userMemoryChange.findMany({
    where: { ...ownerWhere(owner), sourceThreadId: thread },
    orderBy: { createdAt: 'asc' },
    select: {
      publicId: true,
      messageId: true,
      memoryPublicId: true,
      operation: true,
      previousContent: true,
      newContent: true,
      isEncrypted: true,
      resultVersion: true,
      undoneAt: true,
    },
  });
  if (changes.length === 0) {
    return {};
  }

  const memories = await db.userMemory.findMany({
    where: {
      ...ownerWhere(owner),
      publicId: { in: [...new Set(changes.map((c) => c.memoryPublicId))] },
    },
    select: { publicId: true, version: true },
  });
  const versionOf = new Map(memories.map((m) => [m.publicId, m.version]));

  // What the line names: the statement as it now reads, or the one forgotten.
  const opened = await openOwnedRows(
    changes.map((c) => ({
      content:
        (c.operation === 'DELETE' ? c.previousContent : c.newContent) ?? '',
      isEncrypted: c.isEncrypted,
    })),
    ownerKeyStore(owner),
  );

  const byMessage: ThreadMemoryChanges = {};
  changes.forEach((c, i) => {
    const version = versionOf.get(c.memoryPublicId);
    const view: MemoryChangeView = {
      publicId: c.publicId,
      operation: c.operation,
      content: opened[i].content,
      state: memoryChangeState(c, version === undefined ? null : { version }),
    };
    (byMessage[c.messageId] ??= []).push(view);
  });
  return byMessage;
}

class StaleUndo extends Error {
  constructor(readonly result: 'stale' | 'full') {
    super(result);
  }
}

/**
 * Revert one change (spec "In the thread"): an ADD is deleted, an UPDATE or
 * DELETE restores the previous statement. Refused as `stale` when the memory
 * was written since — the conditions are `memoryChangeState`'s, applied in
 * the `where` clauses so a write landing between the read and the undo is
 * not overwritten either.
 *
 * The change row is claimed first (`undoneAt`), inside the transaction, so
 * two clicks undo once; a refused undo rolls the claim back. The stored
 * ciphertext is copied, not re-sealed: a change row only exists while its
 * profile does, and "forget everything" — the one thing that clears the
 * profile's key — deletes change rows in the same transaction.
 *
 * A restored DELETE gets no source thread: its text came from an earlier
 * turn the change row does not name, and tying it to this thread would make
 * deleting this thread remove a statement this thread did not write.
 */
export async function undoMemoryChange(
  owner: MemoryOwner,
  changePublicId: string,
): Promise<UndoMemoryChangeResult> {
  const id = memoryPublicIdSchema.parse(changePublicId);
  try {
    return await db.$transaction(async (tx) => {
      const change = await tx.userMemoryChange.findFirst({
        where: { publicId: id, ...ownerWhere(owner) },
        select: {
          id: true,
          profileId: true,
          memoryPublicId: true,
          operation: true,
          previousContent: true,
          isEncrypted: true,
          resultVersion: true,
        },
      });
      if (!change) {
        throw new NotFoundException('Memory change not found');
      }
      const claimed = await tx.userMemoryChange.updateMany({
        where: { id: change.id, ...ownerWhere(owner), undoneAt: null },
        data: { undoneAt: new Date() },
      });
      if (claimed.count === 0) {
        return 'already-undone';
      }

      const memory = { ...ownerWhere(owner), publicId: change.memoryPublicId };
      if (change.operation === 'ADD') {
        const { count } = await tx.userMemory.deleteMany({
          where: { ...memory, version: change.resultVersion ?? -1 },
        });
        if (count === 0) {
          throw new StaleUndo('stale');
        }
      } else if (change.operation === 'UPDATE') {
        if (change.previousContent === null) {
          throw new StaleUndo('stale');
        }
        const { count } = await tx.userMemory.updateMany({
          where: { ...memory, version: change.resultVersion ?? -1 },
          data: {
            content: change.previousContent,
            isEncrypted: change.isEncrypted,
            version: { increment: 1 },
          },
        });
        if (count === 0) {
          throw new StaleUndo('stale');
        }
      } else {
        // Lock the profile, as the extraction's apply does, so two restores
        // for one owner cannot both count room for one more memory.
        await tx.$queryRaw`
          SELECT id FROM user_memory_profiles
          WHERE id = ${change.profileId}
            AND organization_id = ${owner.organizationId}
            AND user_id = ${owner.userId}
          FOR UPDATE`;
        // `publicId` is unique across every owner, so this is not scoped:
        // any row holding it means the statement exists again.
        const exists = await tx.userMemory.findFirst({
          where: { publicId: change.memoryPublicId },
          select: { id: true },
        });
        if (exists || change.previousContent === null) {
          throw new StaleUndo('stale');
        }
        const live = await tx.userMemory.count({
          where: {
            ...ownerWhere(owner),
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });
        if (live >= MEMORY_MAX_ENTRIES) {
          throw new StaleUndo('full');
        }
        await tx.userMemory.create({
          data: {
            ...memory,
            profileId: change.profileId,
            content: change.previousContent,
            isEncrypted: change.isEncrypted,
            sourceThreadId: null,
          },
        });
      }
      return 'undone';
    });
  } catch (err) {
    if (err instanceof StaleUndo) {
      return err.result;
    }
    // A concurrent restore of the same DELETE won the unique `publicId`.
    if ((err as { code?: string })?.code === 'P2002') {
      return 'stale';
    }
    throw err;
  }
}

// --- OrgMemoryAdmin: begin ---------------------------------------------------
// The one operation that is not per user. An org admin may delete every
// member's memories — for an organization that stops using the feature — and
// may ask whether any exist, so the panel offers the deletion only when there
// is something to delete. Nothing in this scope reads a memory's content or
// names a user: `memory-rows-are-read-through-one-module.test.ts` fails if a
// function between these markers mentions either.

declare const orgMemoryAdminBrand: unique symbol;

/** An org admin acting on the session's organization, and only that. */
export interface OrgMemoryAdmin {
  readonly organizationId: string;
  readonly [orgMemoryAdminBrand]: true;
}

/** Throws `Unauthorized` for a member who cannot manage the organization. */
export async function orgMemoryAdminFromSession(): Promise<OrgMemoryAdmin> {
  const organizationId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(organizationId);
  return { organizationId } as OrgMemoryAdmin;
}

/** Whether any member of the organization has a memory profile. */
export async function orgHasMemories(admin: OrgMemoryAdmin): Promise<boolean> {
  const any = await db.userMemoryProfile.findFirst({
    where: { organizationId: admin.organizationId },
    select: { id: true },
  });
  return any !== null;
}

/**
 * Delete every member's memories in the organization, without reading them.
 * Profiles go, and their memories and changes cascade with them; a member
 * who comes back starts with extraction on and nothing stored.
 */
export async function deleteAllOrgMemories(
  admin: OrgMemoryAdmin,
): Promise<number> {
  const { count } = await db.userMemoryProfile.deleteMany({
    where: { organizationId: admin.organizationId },
  });
  return count;
}
// --- OrgMemoryAdmin: end -----------------------------------------------------

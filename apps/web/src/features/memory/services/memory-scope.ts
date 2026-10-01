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
  memoryContentSchema,
  memoryPublicIdSchema,
  type MemorySettings,
  type UserMemoryView,
} from '../contracts/memory.types';

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

/** The owner key's storage: the profile's `encryptedDek`, set once. */
function ownerKeyStore(owner: MemoryOwner): OwnerKeyStore {
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
        where: { id: profile.id, ...ownerWhere(owner), encryptedDek: null },
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
    select: { id: true, version: true },
  });
  if (!memory) {
    throw new NotFoundException('Memory not found');
  }

  const key = await resolveOwnerKeyForWrite(ownerKeyStore(owner));
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

/**
 * Whether any member of the organization has a memory. Asked of the memory
 * rows, not the profiles: a profile outlives "forget everything" and is made
 * by flipping the switch, so it says nothing about whether there is anything
 * to delete.
 */
export async function orgHasMemories(admin: OrgMemoryAdmin): Promise<boolean> {
  const any = await db.userMemory.findFirst({
    where: { organizationId: admin.organizationId },
    select: { id: true },
  });
  return any !== null;
}

/**
 * Delete every member's memories in the organization, without reading them —
 * "forget everything" for every member at once, and the same three writes.
 * The profiles stay: deleting them would turn a member's "off" switch back
 * to the default "on", and restart the epoch at 0, so an extraction queued
 * just before would pass the epoch check and write again. Returns how many
 * memories were deleted.
 */
export async function deleteAllOrgMemories(
  admin: OrgMemoryAdmin,
): Promise<number> {
  const where = { organizationId: admin.organizationId };
  const [memories] = await db.$transaction([
    db.userMemory.deleteMany({ where }),
    db.userMemoryChange.deleteMany({ where }),
    db.userMemoryProfile.updateMany({
      where,
      data: { encryptedDek: null, epoch: { increment: 1 } },
    }),
  ]);
  return memories.count;
}
// --- OrgMemoryAdmin: end -----------------------------------------------------

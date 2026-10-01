import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userMemoryProfile: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  userMemory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  userMemoryChange: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
const session = vi.hoisted(() => ({
  orgId: vi.fn(),
  userId: vi.fn(),
}));
const crypto = vi.hoisted(() => ({
  resolveOwnerKeyForWrite: vi.fn(),
  sealOwnedContent: vi.fn(),
  openOwnedRows: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({ default: db }));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => session.orgId(),
  getCurrentUserId: () => session.userId(),
}));
vi.mock('@ragenai/crypto', () => crypto);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { NotFoundException } from '@/libs/utils/errors';
import type { OwnerKeyStore } from '@ragenai/crypto';
import {
  deleteMemory,
  forgetAllMemories,
  getMemorySettings,
  listMemories,
  memoryOwnerFromSession,
  setMemoryExtraction,
  updateMemory,
} from '../memory-scope';

const ORG = 'org-1';
const USER = 'user-1';
const MEMORY_ID = '2c1f4e5a-7b8c-4d9e-a0b1-c2d3e4f5a6b7';
const OWNER_WHERE = { organizationId: ORG, userId: USER };

beforeEach(() => {
  vi.clearAllMocks();
  session.orgId.mockResolvedValue(ORG);
  session.userId.mockResolvedValue(USER);
  crypto.openOwnedRows.mockImplementation(async (rows) => rows);
  crypto.resolveOwnerKeyForWrite.mockResolvedValue({ status: 'plaintext' });
  crypto.sealOwnedContent.mockImplementation((content: string) => ({
    content,
    isEncrypted: false,
  }));
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

const owner = () => memoryOwnerFromSession();

describe('memoryOwnerFromSession', () => {
  it('is built from the session only', async () => {
    expect(await owner()).toEqual(OWNER_WHERE);
  });

  it('refuses a request with no signed-in user', async () => {
    session.userId.mockResolvedValue(null);
    await expect(owner()).rejects.toThrow('No signed-in user');
  });
});

describe('listMemories', () => {
  it('reads only the owner’s rows, unexpired, and returns no isEncrypted flag', async () => {
    const now = new Date('2026-10-02T00:00:00Z');
    db.userMemory.findMany.mockResolvedValue([
      {
        publicId: MEMORY_ID,
        content: 'Prefers bullet points.',
        isEncrypted: false,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
        sourceThread: null,
      },
    ]);

    const memories = await listMemories(await owner(), now);

    expect(db.userMemory.findMany.mock.calls[0][0].where).toEqual({
      ...OWNER_WHERE,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
    expect(memories).toEqual([
      expect.objectContaining({ content: 'Prefers bullet points.' }),
    ]);
    expect(memories[0]).not.toHaveProperty('isEncrypted');
  });
});

describe('updateMemory', () => {
  it('writes under the version it read, scoped to the owner', async () => {
    db.userMemory.findFirst.mockResolvedValue({ id: 7, version: 3 });
    db.userMemory.updateMany.mockResolvedValue({ count: 1 });

    await updateMemory(await owner(), MEMORY_ID, '  Is the CFO.  ');

    expect(db.userMemory.findFirst.mock.calls[0][0].where).toEqual({
      publicId: MEMORY_ID,
      ...OWNER_WHERE,
    });
    expect(db.userMemory.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 7, ...OWNER_WHERE, version: 3 },
      data: {
        content: 'Is the CFO.',
        isEncrypted: false,
        version: { increment: 1 },
      },
    });
  });

  it('is NotFound for another user’s memory, and writes nothing', async () => {
    db.userMemory.findFirst.mockResolvedValue(null);

    await expect(
      updateMemory(await owner(), MEMORY_ID, 'Is the CFO.'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.userMemory.updateMany).not.toHaveBeenCalled();
    expect(crypto.resolveOwnerKeyForWrite).not.toHaveBeenCalled();
  });

  it('writes nothing when encryption is on and the owner key is unavailable', async () => {
    db.userMemory.findFirst.mockResolvedValue({ id: 7, version: 1 });
    crypto.resolveOwnerKeyForWrite.mockResolvedValue({
      status: 'unavailable',
      error: new Error('kms down'),
    });

    await expect(
      updateMemory(await owner(), MEMORY_ID, 'Is the CFO.'),
    ).rejects.toThrow('could not be saved');
    expect(db.userMemory.updateMany).not.toHaveBeenCalled();
  });

  it('refuses text over 300 characters and an id that is not a UUID', async () => {
    await expect(
      updateMemory(await owner(), MEMORY_ID, 'x'.repeat(301)),
    ).rejects.toThrow();
    await expect(
      updateMemory(await owner(), '42', 'Is the CFO.'),
    ).rejects.toThrow();
    expect(db.userMemory.findFirst).not.toHaveBeenCalled();
  });

  it('reports a memory that changed between the read and the write', async () => {
    db.userMemory.findFirst.mockResolvedValue({ id: 7, version: 1 });
    db.userMemory.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      updateMemory(await owner(), MEMORY_ID, 'Is the CFO.'),
    ).rejects.toThrow('changed');
  });
});

describe('deleteMemory', () => {
  it('deletes only the owner’s row', async () => {
    db.userMemory.deleteMany.mockResolvedValue({ count: 1 });
    await deleteMemory(await owner(), MEMORY_ID);
    expect(db.userMemory.deleteMany.mock.calls[0][0].where).toEqual({
      publicId: MEMORY_ID,
      ...OWNER_WHERE,
    });
  });

  it('is NotFound for another user’s memory', async () => {
    db.userMemory.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteMemory(await owner(), MEMORY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('forgetAllMemories', () => {
  it('deletes the owner’s memories and changes, clears the key and moves the epoch, keeping the profile', async () => {
    await forgetAllMemories(await owner());

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.userMemory.deleteMany).toHaveBeenCalledWith({
      where: OWNER_WHERE,
    });
    expect(db.userMemoryChange.deleteMany).toHaveBeenCalledWith({
      where: OWNER_WHERE,
    });
    expect(db.userMemoryProfile.updateMany).toHaveBeenCalledWith({
      where: OWNER_WHERE,
      data: { encryptedDek: null, epoch: { increment: 1 } },
    });
  });
});

describe('setMemoryExtraction', () => {
  it('moves the epoch on when switched off, so a queued job writes nothing', async () => {
    await setMemoryExtraction(await owner(), false);
    expect(db.userMemoryProfile.upsert.mock.calls[0][0]).toEqual({
      where: { organizationId_userId: OWNER_WHERE },
      create: { ...OWNER_WHERE, extractionEnabled: false },
      update: { extractionEnabled: false, epoch: { increment: 1 } },
    });
  });

  it('leaves the epoch alone when switched on', async () => {
    await setMemoryExtraction(await owner(), true);
    expect(db.userMemoryProfile.upsert.mock.calls[0][0].update).toEqual({
      extractionEnabled: true,
    });
  });
});

describe('getMemorySettings', () => {
  it('defaults to on for a user with no profile yet', async () => {
    db.userMemoryProfile.findUnique.mockResolvedValue(null);
    expect(await getMemorySettings(await owner())).toEqual({
      extractionEnabled: true,
    });
  });
});

describe('the owner key store', () => {
  /** The store memory-scope hands to the crypto package, captured from a write. */
  async function captureStore(): Promise<OwnerKeyStore> {
    db.userMemory.findFirst.mockResolvedValue({ id: 7, version: 1 });
    db.userMemory.updateMany.mockResolvedValue({ count: 1 });
    await updateMemory(await owner(), MEMORY_ID, 'Is the CFO.');
    return crypto.resolveOwnerKeyForWrite.mock.calls[0][0];
  }

  it('stores the key only while the profile has none', async () => {
    const store = await captureStore();
    db.userMemoryProfile.upsert.mockResolvedValue({ id: 3 });
    db.userMemoryProfile.updateMany.mockResolvedValue({ count: 1 });

    expect(await store.saveIfAbsent('wrapped')).toBe(true);
    expect(db.userMemoryProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 3, ...OWNER_WHERE, encryptedDek: null },
      data: { encryptedDek: 'wrapped' },
    });
  });

  it('reads the profile a concurrent first write created, instead of failing', async () => {
    const store = await captureStore();
    db.userMemoryProfile.upsert.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    db.userMemoryProfile.findUniqueOrThrow.mockResolvedValue({ id: 3 });
    db.userMemoryProfile.updateMany.mockResolvedValue({ count: 0 });

    expect(await store.saveIfAbsent('wrapped')).toBe(false);
    expect(db.userMemoryProfile.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { organizationId_userId: OWNER_WHERE },
      select: { id: true },
    });
  });
});

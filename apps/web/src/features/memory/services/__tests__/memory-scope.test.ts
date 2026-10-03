import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userMemoryProfile: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  userMemory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  userMemoryChange: { deleteMany: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));
/** The client an interactive transaction hands its callback. */
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  userMemoryChange: { findFirst: vi.fn(), updateMany: vi.fn() },
  userMemory: {
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
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
const requireOrgAdmin = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdmin: (orgId: string) => requireOrgAdmin(orgId),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { NotFoundException } from '@/libs/utils/errors';
import type { OwnerKeyStore } from '@ragenai/crypto';
import {
  deleteAllOrgMemories,
  deleteMemory,
  forgetAllMemories,
  orgHasMemories,
  orgMemoryAdminFromSession,
  getMemorySettings,
  listMemories,
  listThreadMemoryChanges,
  memoryOwnerFromSession,
  setMemoryExtraction,
  undoMemoryChange,
  updateMemory,
} from '../memory-scope';
import { MEMORY_MAX_ENTRIES } from '../../contracts/memory.types';

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
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? arg(tx) : arg,
  );
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
    db.userMemory.findFirst.mockResolvedValue({
      id: 7,
      version: 3,
      profile: { epoch: 2 },
    });
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
    db.userMemory.findFirst.mockResolvedValue({
      id: 7,
      version: 1,
      profile: { epoch: 2 },
    });
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
    db.userMemory.findFirst.mockResolvedValue({
      id: 7,
      version: 1,
      profile: { epoch: 2 },
    });
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
    db.userMemory.findFirst.mockResolvedValue({
      id: 7,
      version: 1,
      profile: { epoch: 2 },
    });
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
      where: { id: 3, ...OWNER_WHERE, encryptedDek: null, epoch: 2 },
      data: { encryptedDek: 'wrapped' },
    });
  });

  it('stores no key once forget-everything has moved the epoch on', async () => {
    // updateMemory read the profile at epoch 2; "forget everything" then
    // cleared the key and moved it to 3, so the conditional write matches
    // nothing and the cleared profile stays without a key.
    const store = await captureStore();
    db.userMemoryProfile.upsert.mockResolvedValue({ id: 3 });
    db.userMemoryProfile.updateMany.mockResolvedValue({ count: 0 });

    expect(await store.saveIfAbsent('wrapped')).toBe(false);
    expect(db.userMemoryProfile.updateMany.mock.calls[0][0].where.epoch).toBe(
      2,
    );
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

describe('the org admin scope', () => {
  it('refuses a member who cannot manage the organization', async () => {
    requireOrgAdmin.mockRejectedValue(new Error('Unauthorized'));
    await expect(orgMemoryAdminFromSession()).rejects.toThrow('Unauthorized');
  });

  it('is built from the session’s organization and checks it', async () => {
    requireOrgAdmin.mockResolvedValue({ role: 'admin' });
    expect(await orgMemoryAdminFromSession()).toEqual({ organizationId: ORG });
    expect(requireOrgAdmin).toHaveBeenCalledWith(ORG);
  });

  it('deletes only this organization’s profiles, and selects nothing', async () => {
    requireOrgAdmin.mockResolvedValue({ role: 'admin' });
    db.userMemoryProfile.deleteMany.mockResolvedValue({ count: 4 });

    const deleted = await deleteAllOrgMemories(
      await orgMemoryAdminFromSession(),
    );

    expect(deleted).toBe(4);
    expect(db.userMemoryProfile.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG },
    });
    expect(db.userMemory.findMany).not.toHaveBeenCalled();
  });

  it('asks whether memories exist by profile id alone', async () => {
    requireOrgAdmin.mockResolvedValue({ role: 'admin' });
    db.userMemoryProfile.findFirst.mockResolvedValue({ id: 1 });

    expect(await orgHasMemories(await orgMemoryAdminFromSession())).toBe(true);
    expect(db.userMemoryProfile.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      select: { id: true },
    });
  });
});

const THREAD_ID = '7d2e9f40-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CHANGE_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

describe('listThreadMemoryChanges', () => {
  const row = (over: Record<string, unknown>) => ({
    publicId: CHANGE_ID,
    messageId: 'msg-1',
    memoryPublicId: MEMORY_ID,
    operation: 'ADD',
    previousContent: null,
    newContent: 'Prefers bullet points.',
    isEncrypted: false,
    resultVersion: 1,
    undoneAt: null,
    ...over,
  });

  it('reads only the owner’s change rows for that thread', async () => {
    db.userMemoryChange.findMany.mockResolvedValue([]);
    expect(await listThreadMemoryChanges(await owner(), THREAD_ID)).toEqual({});
    expect(db.userMemoryChange.findMany.mock.calls[0][0].where).toEqual({
      ...OWNER_WHERE,
      sourceThreadId: THREAD_ID,
    });
    expect(db.userMemory.findMany).not.toHaveBeenCalled();
  });

  it('reads a seeded thread whose id carries no RFC 4122 version', async () => {
    db.userMemoryChange.findMany.mockResolvedValue([]);
    const seeded = 'e2e00000-0000-0000-0000-00e2e0000010';
    expect(await listThreadMemoryChanges(await owner(), seeded)).toEqual({});
    expect(db.userMemoryChange.findMany.mock.calls[0][0].where).toEqual({
      ...OWNER_WHERE,
      sourceThreadId: seeded,
    });
  });

  it('refuses a thread id that is not a UUID before querying', async () => {
    await expect(
      listThreadMemoryChanges(await owner(), 'not-a-uuid'),
    ).rejects.toThrow();
    expect(db.userMemoryChange.findMany).not.toHaveBeenCalled();
  });

  it('groups by message, names the forgotten statement for a DELETE, and states each row', async () => {
    db.userMemoryChange.findMany.mockResolvedValue([
      row({}),
      row({
        publicId: 'c2',
        memoryPublicId: 'm2',
        operation: 'UPDATE',
        previousContent: 'Is a junior accountant.',
        newContent: 'Is a senior accountant.',
        resultVersion: 2,
      }),
      row({
        publicId: 'c3',
        messageId: 'msg-2',
        memoryPublicId: 'm3',
        operation: 'DELETE',
        previousContent: 'Works on the X tender.',
        newContent: null,
        resultVersion: null,
      }),
    ]);
    // m2 was edited in settings since (version 3); m3 is still gone.
    db.userMemory.findMany.mockResolvedValue([
      { publicId: MEMORY_ID, version: 1 },
      { publicId: 'm2', version: 3 },
    ]);

    const changes = await listThreadMemoryChanges(await owner(), THREAD_ID);

    expect(db.userMemory.findMany.mock.calls[0][0].where).toEqual({
      ...OWNER_WHERE,
      publicId: { in: [MEMORY_ID, 'm2', 'm3'] },
    });
    expect(changes).toEqual({
      'msg-1': [
        {
          publicId: CHANGE_ID,
          operation: 'ADD',
          content: 'Prefers bullet points.',
          state: 'undoable',
        },
        {
          publicId: 'c2',
          operation: 'UPDATE',
          content: 'Is a senior accountant.',
          state: 'stale',
        },
      ],
      'msg-2': [
        {
          publicId: 'c3',
          operation: 'DELETE',
          content: 'Works on the X tender.',
          state: 'undoable',
        },
      ],
    });
  });
});

describe('undoMemoryChange', () => {
  const change = (over: Record<string, unknown>) => ({
    id: 11,
    profileId: 5,
    memoryPublicId: MEMORY_ID,
    operation: 'ADD',
    previousContent: null,
    isEncrypted: false,
    resultVersion: 1,
    ...over,
  });

  beforeEach(() => {
    tx.userMemoryChange.updateMany.mockResolvedValue({ count: 1 });
    tx.userMemory.deleteMany.mockResolvedValue({ count: 1 });
    tx.userMemory.updateMany.mockResolvedValue({ count: 1 });
    tx.userMemory.findFirst.mockResolvedValue(null);
    tx.userMemory.count.mockResolvedValue(0);
    tx.userMemory.create.mockResolvedValue({});
  });

  it('finds the change only among the owner’s rows; anyone else’s is NotFound', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(null);
    await expect(undoMemoryChange(await owner(), CHANGE_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.userMemoryChange.findFirst.mock.calls[0][0].where).toEqual({
      publicId: CHANGE_ID,
      ...OWNER_WHERE,
    });
  });

  it('claims the change before touching the memory, so two clicks undo once', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(change({}));
    tx.userMemoryChange.updateMany.mockResolvedValue({ count: 0 });

    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe(
      'already-undone',
    );
    expect(tx.userMemoryChange.updateMany.mock.calls[0][0].where).toEqual({
      id: 11,
      undoneAt: null,
    });
    expect(tx.userMemory.deleteMany).not.toHaveBeenCalled();
  });

  it('undoes an ADD by deleting the memory at the version it produced', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(change({}));
    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe('undone');
    expect(tx.userMemory.deleteMany).toHaveBeenCalledWith({
      where: { ...OWNER_WHERE, publicId: MEMORY_ID, version: 1 },
    });
  });

  it('undoes an UPDATE by restoring the previous statement, bumping the version', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(
      change({
        operation: 'UPDATE',
        previousContent: 'sealed-old',
        isEncrypted: true,
        resultVersion: 4,
      }),
    );
    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe('undone');
    expect(tx.userMemory.updateMany).toHaveBeenCalledWith({
      where: { ...OWNER_WHERE, publicId: MEMORY_ID, version: 4 },
      data: {
        content: 'sealed-old',
        isEncrypted: true,
        version: { increment: 1 },
      },
    });
  });

  it('undoes a DELETE by recreating the memory under its own id, tied to no thread', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(
      change({
        operation: 'DELETE',
        previousContent: 'Works on the X tender.',
        resultVersion: null,
      }),
    );
    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe('undone');
    expect(tx.userMemory.create).toHaveBeenCalledWith({
      data: {
        ...OWNER_WHERE,
        publicId: MEMORY_ID,
        profileId: 5,
        content: 'Works on the X tender.',
        isEncrypted: false,
        sourceThreadId: null,
      },
    });
  });

  it('locks the owner’s profile before counting room for a restored DELETE', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(
      change({
        operation: 'DELETE',
        previousContent: 'x',
        resultVersion: null,
      }),
    );
    const order: string[] = [];
    tx.$queryRaw.mockImplementation(async () => order.push('lock'));
    tx.userMemory.count.mockImplementation(async () => {
      order.push('count');
      return 0;
    });

    await undoMemoryChange(await owner(), CHANGE_ID);

    const [sql, ...values] = tx.$queryRaw.mock.calls[0];
    expect((sql as TemplateStringsArray).join('?')).toMatch(
      /FROM user_memory_profiles[\s\S]*FOR UPDATE/,
    );
    expect(values).toEqual([5, ORG, USER]);
    expect(order).toEqual(['lock', 'count']);
  });

  // The spec's D2 tests. A later extraction and a settings edit both bump
  // `version`, so the conditional write matches nothing; the undo is refused
  // and its claim rolls back with the transaction.
  it.each([
    ['an ADD', 'a later extraction', change({})],
    ['an ADD', 'a settings edit', change({})],
    [
      'an UPDATE',
      'a later extraction',
      change({ operation: 'UPDATE', previousContent: 'old', resultVersion: 2 }),
    ],
    [
      'an UPDATE',
      'a settings edit',
      change({ operation: 'UPDATE', previousContent: 'old', resultVersion: 2 }),
    ],
  ])('refuses %s once %s has written the memory since', async (_op, _by, c) => {
    tx.userMemoryChange.findFirst.mockResolvedValue(c);
    tx.userMemory.deleteMany.mockResolvedValue({ count: 0 });
    tx.userMemory.updateMany.mockResolvedValue({ count: 0 });

    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe('stale');
    // Thrown inside the callback, so the transaction — the claim included —
    // rolls back rather than leaving the change marked undone.
    await expect(db.$transaction.mock.results[0].value).rejects.toThrow();
  });

  it('refuses a DELETE once a memory with that id exists again', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(
      change({
        operation: 'DELETE',
        previousContent: 'x',
        resultVersion: null,
      }),
    );
    tx.userMemory.findFirst.mockResolvedValue({ id: 3 });

    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe('stale');
    expect(tx.userMemory.create).not.toHaveBeenCalled();
  });

  it('refuses a DELETE that loses a race for its id to a concurrent restore', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(
      change({
        operation: 'DELETE',
        previousContent: 'x',
        resultVersion: null,
      }),
    );
    tx.userMemory.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe('stale');
  });

  it('refuses to restore a DELETE past the entry limit', async () => {
    tx.userMemoryChange.findFirst.mockResolvedValue(
      change({
        operation: 'DELETE',
        previousContent: 'x',
        resultVersion: null,
      }),
    );
    tx.userMemory.count.mockResolvedValue(MEMORY_MAX_ENTRIES);

    expect(await undoMemoryChange(await owner(), CHANGE_ID)).toBe('full');
    expect(tx.userMemory.create).not.toHaveBeenCalled();
  });

  it('refuses a change id that is not a UUID before opening a transaction', async () => {
    await expect(undoMemoryChange(await owner(), 'nope')).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const m = vi.hoisted(() => ({
  orgId: vi.fn(),
  featureOn: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  settings: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  forget: vi.fn(),
  setExtraction: vi.fn(),
}));

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => m.orgId(),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: (...a: unknown[]) => m.featureOn(...a) }),
);
vi.mock('@/features/memory/services/queries/get-user-memories-query', () => ({
  getUserMemoriesQuery: () => m.list(),
  countUserMemoriesQuery: () => m.count(),
  getMemorySettingsQuery: () => m.settings(),
}));
vi.mock(
  '@/features/memory/services/commands/update-user-memory-command',
  () => ({ updateUserMemoryCommand: (...a: unknown[]) => m.update(...a) }),
);
vi.mock(
  '@/features/memory/services/commands/delete-user-memory-command',
  () => ({ deleteUserMemoryCommand: (...a: unknown[]) => m.remove(...a) }),
);
vi.mock(
  '@/features/memory/services/commands/forget-all-user-memories-command',
  () => ({ forgetAllUserMemoriesCommand: () => m.forget() }),
);
vi.mock(
  '@/features/memory/services/commands/set-memory-extraction-command',
  () => ({
    setMemoryExtractionCommand: (...a: unknown[]) => m.setExtraction(...a),
  }),
);

import { NotFoundException } from '@/libs/utils/errors';
import {
  deleteMemoryAction,
  forgetAllMemoriesAction,
  getMemoryPageAction,
  setMemoryExtractionAction,
  updateMemoryAction,
} from '../actions';

const ID = '2c1f4e5a-7b8c-4d9e-a0b1-c2d3e4f5a6b7';

beforeEach(() => {
  vi.clearAllMocks();
  m.orgId.mockResolvedValue('org-1');
  m.featureOn.mockResolvedValue(true);
  m.list.mockResolvedValue([{ publicId: ID, content: 'Is the CFO.' }]);
  m.count.mockResolvedValue(1);
  m.settings.mockResolvedValue({ extractionEnabled: true });
});

describe('getMemoryPageAction', () => {
  it('lists the user’s memories while the feature is on', async () => {
    const data = await getMemoryPageAction();
    expect(m.featureOn).toHaveBeenCalledWith('org-1', 'personalMemory');
    expect(data).toMatchObject({
      enabled: true,
      storedCount: 1,
      maxEntries: 50,
      extractionEnabled: true,
    });
    expect(data.memories).toHaveLength(1);
  });

  it('lists nothing while it is off, but still says what is stored', async () => {
    m.featureOn.mockResolvedValue(false);
    const data = await getMemoryPageAction();
    expect(data.memories).toEqual([]);
    expect(data.storedCount).toBe(1);
    expect(m.list).not.toHaveBeenCalled();
  });
});

describe('the mutations', () => {
  it('edit, delete and the switch are refused while the feature is off', async () => {
    m.featureOn.mockResolvedValue(false);
    expect(await updateMemoryAction(ID, 'x')).toEqual({
      success: false,
      error: 'off',
    });
    expect(await deleteMemoryAction(ID)).toEqual({
      success: false,
      error: 'off',
    });
    expect(await setMemoryExtractionAction(false)).toEqual({
      success: false,
      error: 'off',
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.setExtraction).not.toHaveBeenCalled();
  });

  it('forget everything is always allowed: erasure is a right, not a feature', async () => {
    m.featureOn.mockResolvedValue(false);
    expect(await forgetAllMemoriesAction()).toEqual({ success: true });
    expect(m.forget).toHaveBeenCalledTimes(1);
  });

  it('passes the edit through and reports success', async () => {
    expect(await updateMemoryAction(ID, 'Is the CFO.')).toEqual({
      success: true,
    });
    expect(m.update).toHaveBeenCalledWith(ID, 'Is the CFO.');
  });

  it('maps another user’s memory to not_found, and bad input to invalid', async () => {
    m.update.mockRejectedValueOnce(new NotFoundException());
    expect(await updateMemoryAction(ID, 'x')).toEqual({
      success: false,
      error: 'not_found',
    });

    m.update.mockRejectedValueOnce(new ZodError([]));
    expect(await updateMemoryAction(ID, 'x')).toEqual({
      success: false,
      error: 'invalid',
    });

    m.remove.mockRejectedValueOnce(new Error('db down'));
    expect(await deleteMemoryAction(ID)).toEqual({
      success: false,
      error: 'failed',
    });
  });
});

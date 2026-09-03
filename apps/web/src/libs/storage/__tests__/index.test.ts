import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSharedStorageProvider = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/storage', () => ({
  getStorageProvider: getSharedStorageProvider,
  StorageNotFoundError: class extends Error {},
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getStorageProvider } from '../index';

describe('apps/web storage binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to the shared factory', () => {
    const provider = { upload: vi.fn() };
    getSharedStorageProvider.mockReturnValue(provider);

    expect(getStorageProvider()).toBe(provider);
  });

  // The only behaviour this thin binding has. If the callback stopped reaching
  // the app logger, ADR-27's local-in-production warning would vanish silently.
  it('routes the local-in-production warning through the app logger', () => {
    getSharedStorageProvider.mockReturnValue({});

    getStorageProvider();

    const warn = getSharedStorageProvider.mock.calls[0][0] as (
      message: string,
    ) => void;
    expect(typeof warn).toBe('function');

    warn('storage warning');
    expect(loggerWarn).toHaveBeenCalledWith('storage warning');
  });
});

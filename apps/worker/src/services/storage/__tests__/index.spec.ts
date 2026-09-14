const mockGetSharedStorageProvider = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('@ragenai/storage', () => ({
  getStorageProvider: (...args: unknown[]) =>
    mockGetSharedStorageProvider(...args),
  StorageNotFoundError: class extends Error {},
}));

vi.mock('../../logger.js', () => ({
  logger: { warn: mockLoggerWarn, info: vi.fn(), error: vi.fn() },
}));

import { getStorageProvider } from '../index.js';

describe('worker storage binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to the shared factory', () => {
    const provider = { upload: vi.fn() };
    mockGetSharedStorageProvider.mockReturnValue(provider);

    expect(getStorageProvider()).toBe(provider);
  });

  // The only behaviour this thin binding has. If the callback stopped reaching
  // the worker logger, ADR-27's local-in-production warning would vanish
  // silently — and the worker is the side that writes the files.
  it('routes the local-in-production warning through the worker logger', () => {
    mockGetSharedStorageProvider.mockReturnValue({});

    getStorageProvider();

    const warn = mockGetSharedStorageProvider.mock.calls[0][0] as (
      message: string,
    ) => void;
    expect(typeof warn).toBe('function');

    warn('storage warning');
    expect(mockLoggerWarn).toHaveBeenCalledWith('storage warning');
  });
});

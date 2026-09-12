import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUniqueOrThrow = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: {
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

const {
  mockIsEncryptionEnabled,
  mockAssertEncryptionAvailable,
  mockGenerateThreadKey,
  mockDecryptThreadKey,
} = vi.hoisted(() => ({
  mockIsEncryptionEnabled: vi.fn(),
  mockAssertEncryptionAvailable: vi.fn(),
  mockGenerateThreadKey: vi.fn(),
  mockDecryptThreadKey: vi.fn(),
}));

vi.mock('@ragenai/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ragenai/crypto')>()),
  isEncryptionEnabled: mockIsEncryptionEnabled,
  assertEncryptionAvailable: mockAssertEncryptionAvailable,
  generateThreadKey: mockGenerateThreadKey,
  decryptThreadKey: mockDecryptThreadKey,
  encryptContent: (content: string) => `enc:${content}`,
}));

import { EncryptionRequiredError } from '@ragenai/crypto';
import { maybeEncryptContent } from '../thread-content-encryption';

describe('maybeEncryptContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the content unchanged, without asserting, when encryption is enabled', async () => {
    mockIsEncryptionEnabled.mockReturnValue(true);
    mockFindUniqueOrThrow.mockResolvedValue({ encryptedDek: 'wrapped' });
    mockDecryptThreadKey.mockResolvedValue(Buffer.alloc(32));

    const result = await maybeEncryptContent('thread-1', 'hello');

    expect(result).toBe('enc:hello');
    expect(mockAssertEncryptionAvailable).not.toHaveBeenCalled();
  });

  it('checks the requirement and returns plaintext when encryption is off but not required', async () => {
    mockIsEncryptionEnabled.mockReturnValue(false);
    mockAssertEncryptionAvailable.mockImplementation(() => undefined);

    const result = await maybeEncryptContent('thread-1', 'hello');

    expect(result).toBe('hello');
    expect(mockAssertEncryptionAvailable).toHaveBeenCalledOnce();
  });

  it('throws instead of persisting plaintext when encryption is required but unavailable', async () => {
    mockIsEncryptionEnabled.mockReturnValue(false);
    mockAssertEncryptionAvailable.mockImplementation(() => {
      throw new EncryptionRequiredError();
    });

    await expect(maybeEncryptContent('thread-1', 'hello')).rejects.toThrow(
      EncryptionRequiredError,
    );
    expect(mockFindUniqueOrThrow).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirstOrThrow = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: {
      findFirstOrThrow: (...args: unknown[]) => mockFindFirstOrThrow(...args),
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
import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';
import { maybeEncryptContent } from '../thread-content-encryption';

const THREAD = { threadId: 'thread-1', organizationId: 'org-1' };

describe('maybeEncryptContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the content unchanged, without asserting, when encryption is enabled', async () => {
    mockIsEncryptionEnabled.mockReturnValue(true);
    mockFindFirstOrThrow.mockResolvedValue({ encryptedDek: 'wrapped' });
    mockDecryptThreadKey.mockResolvedValue(Buffer.alloc(32));

    const result = await maybeEncryptContent(THREAD, 'hello');

    expect(result).toBe('enc:hello');
    expect(mockAssertEncryptionAvailable).not.toHaveBeenCalled();
  });

  it('checks the requirement and returns plaintext when encryption is off but not required', async () => {
    mockIsEncryptionEnabled.mockReturnValue(false);
    mockAssertEncryptionAvailable.mockImplementation(() => undefined);

    const result = await maybeEncryptContent(THREAD, 'hello');

    expect(result).toBe('hello');
    expect(mockAssertEncryptionAvailable).toHaveBeenCalledOnce();
  });

  it('throws instead of persisting plaintext when encryption is required but unavailable', async () => {
    mockIsEncryptionEnabled.mockReturnValue(false);
    mockAssertEncryptionAvailable.mockImplementation(() => {
      throw new EncryptionRequiredError();
    });

    await expect(maybeEncryptContent(THREAD, 'hello')).rejects.toThrow(
      EncryptionRequiredError,
    );
    expect(mockFindFirstOrThrow).not.toHaveBeenCalled();
  });

  describe('within the caller’s organization', () => {
    beforeEach(() => {
      mockIsEncryptionEnabled.mockReturnValue(true);
    });

    it('reads the thread’s key by id and organization', async () => {
      mockFindFirstOrThrow.mockResolvedValue({ encryptedDek: 'wrapped' });
      mockDecryptThreadKey.mockResolvedValue(Buffer.alloc(32));

      await maybeEncryptContent(THREAD, 'hello');

      const args = mockFindFirstOrThrow.mock.calls[0][0];
      expect(args).toEqual({
        where: { id: 'thread-1', organizationId: 'org-1' },
        select: { encryptedDek: true },
      });
      expect(isTenantScopeSatisfied('Thread', 'findFirstOrThrow', args)).toBe(
        true,
      );
    });

    it('creates a missing key, and re-reads a race winner’s, inside the organization', async () => {
      mockFindFirstOrThrow
        .mockResolvedValueOnce({ encryptedDek: null })
        .mockResolvedValueOnce({ encryptedDek: 'winner' });
      mockGenerateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.alloc(32),
        encryptedDek: 'mine',
      });
      mockUpdateMany.mockResolvedValue({ count: 0 });
      mockDecryptThreadKey.mockResolvedValue(Buffer.alloc(32));

      await maybeEncryptContent(THREAD, 'hello');

      const update = mockUpdateMany.mock.calls[0][0];
      expect(update).toEqual({
        where: { id: 'thread-1', organizationId: 'org-1', encryptedDek: null },
        data: { encryptedDek: 'mine' },
      });
      expect(isTenantScopeSatisfied('Thread', 'updateMany', update)).toBe(true);
      expect(mockFindFirstOrThrow).toHaveBeenLastCalledWith({
        where: { id: 'thread-1', organizationId: 'org-1' },
        select: { encryptedDek: true },
      });
      expect(mockDecryptThreadKey).toHaveBeenCalledWith('winner');
    });

    it('throws for another organization’s thread, without creating or reading its key', async () => {
      mockFindFirstOrThrow.mockRejectedValue(new Error('No Thread found'));

      await expect(
        maybeEncryptContent(
          { threadId: 'thread-of-org-2', organizationId: 'org-1' },
          'hello',
        ),
      ).rejects.toThrow('No Thread found');
      expect(mockGenerateThreadKey).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockDecryptThreadKey).not.toHaveBeenCalled();
    });
  });
});

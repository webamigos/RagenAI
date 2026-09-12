import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userDocument: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

vi.mock('../create-document-version-command', () => ({
  createDocumentVersionCommand: vi.fn(),
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
import { updateDocumentContentCommand } from '../update-document-command';

describe('updateDocumentContentCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindFirst.mockResolvedValue({ encryptedDek: null, title: 'Doc' });
  });

  const args = {
    orgId: 'org-1',
    documentId: 'doc-1',
    content: 'plain text',
  };

  it('encrypts and does not assert when encryption is enabled', async () => {
    mockIsEncryptionEnabled.mockReturnValue(true);
    mockGenerateThreadKey.mockResolvedValue({
      plaintextDek: Buffer.alloc(32),
      encryptedDek: 'wrapped',
    });

    await updateDocumentContentCommand(args);

    expect(mockAssertEncryptionAvailable).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'enc:plain text' }),
      }),
    );
  });

  it('asserts the requirement and stores plaintext when encryption is off but not required', async () => {
    mockIsEncryptionEnabled.mockReturnValue(false);
    mockAssertEncryptionAvailable.mockImplementation(() => undefined);

    await updateDocumentContentCommand(args);

    expect(mockAssertEncryptionAvailable).toHaveBeenCalledOnce();
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'plain text' }),
      }),
    );
  });

  it('throws instead of persisting plaintext when encryption is required but unavailable', async () => {
    mockIsEncryptionEnabled.mockReturnValue(false);
    mockAssertEncryptionAvailable.mockImplementation(() => {
      throw new EncryptionRequiredError();
    });

    await expect(updateDocumentContentCommand(args)).rejects.toThrow(
      EncryptionRequiredError,
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

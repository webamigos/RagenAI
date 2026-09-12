import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userDocument: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

const {
  mockIsEncryptionEnabled,
  mockAssertEncryptionAvailable,
  mockGenerateThreadKey,
} = vi.hoisted(() => ({
  mockIsEncryptionEnabled: vi.fn(),
  mockAssertEncryptionAvailable: vi.fn(),
  mockGenerateThreadKey: vi.fn(),
}));

vi.mock('@ragenai/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ragenai/crypto')>()),
  isEncryptionEnabled: mockIsEncryptionEnabled,
  assertEncryptionAvailable: mockAssertEncryptionAvailable,
  generateThreadKey: mockGenerateThreadKey,
  encryptContent: (content: string) => `enc:${content}`,
}));

import { EncryptionRequiredError } from '@ragenai/crypto';
import { createDocumentCommand } from '../create-document-command';

describe('createDocumentCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockImplementation(({ data }: { data: unknown }) => data);
  });

  const input = {
    id: 'doc-1',
    title: 'Doc',
    content: 'plain text',
    organizationId: 'org-1',
  };

  it('encrypts and does not assert when encryption is enabled', async () => {
    mockIsEncryptionEnabled.mockReturnValue(true);
    mockGenerateThreadKey.mockResolvedValue({
      plaintextDek: Buffer.alloc(32),
      encryptedDek: 'wrapped',
    });

    await createDocumentCommand(input);

    expect(mockAssertEncryptionAvailable).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'enc:plain text' }),
      }),
    );
  });

  it('asserts the requirement and stores plaintext when encryption is off but not required', async () => {
    mockIsEncryptionEnabled.mockReturnValue(false);
    mockAssertEncryptionAvailable.mockImplementation(() => undefined);

    await createDocumentCommand(input);

    expect(mockAssertEncryptionAvailable).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
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

    await expect(createDocumentCommand(input)).rejects.toThrow(
      EncryptionRequiredError,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

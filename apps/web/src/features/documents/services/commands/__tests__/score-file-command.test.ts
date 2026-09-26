import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

const mockJobStart = vi.fn();
vi.mock('@/libs/jobs', () => ({
  jobs: () => ({ start: (...args: unknown[]) => mockJobStart(...args) }),
}));

vi.mock('@/features/documents/contracts/document.types', () => ({
  Workflow: { SCORE_DOCUMENT: 'scoreDocument' },
}));

const mockDecrypt = vi.fn();
vi.mock('@ragenai/crypto', () => ({
  decryptDocumentContent: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockIsFeatureEnabled = vi.fn();
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...args: unknown[]) =>
      mockIsFeatureEnabled(...args),
  }),
);

import { scoreFileCommand } from '../score-file-command';
import { UnauthorizedException } from '@/libs/utils/errors';

describe('scoreFileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockDecrypt.mockImplementation(async (content: string) => content);
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      fileName: 'umowa.docx',
      projectId: null,
      document: { id: 'doc-1', content: 'Tekst umowy.', encryptedDek: null },
    });
  });

  it('starts the scoring job for a file of this organization', async () => {
    await scoreFileCommand('file-1', 'org-1');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-1', organizationId: 'org-1' },
      }),
    );
    expect(mockJobStart).toHaveBeenCalledWith(
      'scoreDocument',
      expect.any(String),
      expect.objectContaining({ fileId: 'file-1', orgId: 'org-1' }),
    );
  });

  // The menu item is hidden when the key is off; this is the gate behind it.
  it('refuses, before reading the file, where scoring is turned off', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    await expect(scoreFileCommand('file-1', 'org-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(
      'org-1',
      'ragReadinessScore',
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockJobStart).not.toHaveBeenCalled();
  });

  // With encryption on, `content` is ciphertext. The button sent it as it
  // was, so the model graded noise.
  it('scores the decrypted text, not what is stored', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      fileName: 'umowa.docx',
      projectId: null,
      document: { id: 'doc-1', content: 'v1:ciphertext', encryptedDek: 'dek' },
    });
    mockDecrypt.mockResolvedValue('Tekst umowy.');

    await scoreFileCommand('file-1', 'org-1');

    expect(mockDecrypt).toHaveBeenCalledWith('v1:ciphertext', 'dek');
    expect(mockJobStart).toHaveBeenCalledWith(
      'scoreDocument',
      expect.any(String),
      expect.objectContaining({ documentText: 'Tekst umowy.' }),
    );
  });

  // The raw-file fallback sent unparsed text that had never been masked.
  it('refuses a file with no document row instead of scoring the raw file', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      fileName: 'notes.md',
      projectId: null,
      document: null,
    });

    await expect(scoreFileCommand('file-1', 'org-1')).rejects.toThrow(
      /not finished processing/,
    );
    expect(mockJobStart).not.toHaveBeenCalled();
  });

  it('refuses a document whose text is empty', async () => {
    mockDecrypt.mockResolvedValue('   ');

    await expect(scoreFileCommand('file-1', 'org-1')).rejects.toThrow(
      /no content/,
    );
    expect(mockJobStart).not.toHaveBeenCalled();
  });
});

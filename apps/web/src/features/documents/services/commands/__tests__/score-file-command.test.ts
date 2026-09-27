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

const mockGetActor = vi.fn();
vi.mock('@/features/documents/services/queries/get-document-actor', () => ({
  getDocumentActor: (...args: unknown[]) => mockGetActor(...args),
}));

import { scoreFileCommand } from '../score-file-command';
import { fileAccessWhere } from '@/features/documents/services/queries/document-access';
import { UnauthorizedException } from '@/libs/utils/errors';

const member = {
  userId: 'user-1',
  teamIds: ['team-1'],
  scope: 'member' as const,
};

describe('scoreFileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockGetActor.mockResolvedValue(member);
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
        where: {
          id: 'file-1',
          organizationId: 'org-1',
          ...fileAccessWhere(member),
        },
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

  // Organization scope alone let any member send a private document's text
  // to the model. The member's own access is part of the lookup now, so a
  // file they may not open is indistinguishable from one that does not exist.
  it("looks the file up with the member's own access, and refuses one they cannot open", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(scoreFileCommand('file-1', 'org-1')).rejects.toThrow(
      'File not found',
    );
    expect(mockGetActor).toHaveBeenCalledWith('org-1');
    const where = (mockFindFirst.mock.calls[0][0] as { where: object }).where;
    expect(where).toMatchObject(fileAccessWhere(member));
    expect(Object.keys(fileAccessWhere(member)).length).toBeGreaterThan(0);
    expect(mockJobStart).not.toHaveBeenCalled();
  });

  // Q4, D2: refused in the command, whatever the menu shows.
  it.each(['XLSX', 'CSV'])(
    'refuses a %s file before reading its text or starting a job',
    async (fileType) => {
      mockFindFirst.mockResolvedValue({
        id: 'file-1',
        fileName: 'cennik',
        fileType,
        projectId: null,
        document: { id: 'doc-1', content: 'a,b\n1,2', encryptedDek: null },
      });

      await expect(scoreFileCommand('file-1', 'org-1')).rejects.toThrow(
        /Spreadsheets are not scored/,
      );
      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(mockJobStart).not.toHaveBeenCalled();
    },
  );
});

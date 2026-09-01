import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  userDocument: { findFirst: vi.fn(), updateMany: vi.fn() },
  $executeRaw: vi.fn(),
}));
const createVersion = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({ default: dbMock }));
vi.mock('../create-document-version-command', () => ({
  createDocumentVersionCommand: createVersion,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { applySuggestionsCommand } from '../apply-suggestions-command';

const suggestion = (id: string, before: string, after: string) => ({
  id,
  type: 'terminology',
  location: 'section',
  before,
  after,
  rationale: 'why',
  dimensions: {},
});

const documentWith = (
  content: string,
  suggestions: ReturnType<typeof suggestion>[],
) => ({
  id: 'doc-1',
  content,
  title: 'Doc',
  metadata: { optimizationJob: { id: 'job-1', suggestions } },
});

const input = {
  documentId: 'doc-1',
  orgId: 'org-1',
  authorId: 'user-1',
  acceptedSuggestionIds: ['s1'],
  rejectedSuggestionIds: [] as string[],
};

describe('applySuggestionsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.userDocument.findFirst.mockResolvedValue(
      documentWith('The pracownik signed.', [
        suggestion('s1', 'pracownik', 'zatrudniony'),
      ]),
    );
    dbMock.userDocument.updateMany.mockResolvedValue({ count: 1 });
    dbMock.$executeRaw.mockResolvedValue(1);
    createVersion.mockResolvedValue({ id: 'ver-3', versionNumber: 3 });
  });

  it('applies the stored suggestion and records an AI_OPTIMIZE version', async () => {
    const result = await applySuggestionsCommand(input);

    expect(result).toMatchObject({ newVersionId: 'ver-3', newVersionNumber: 3 });
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        content: 'The zatrudniony signed.',
        changeType: 'AI_OPTIMIZE',
        ragScore: null,
      }),
    );
    expect(dbMock.userDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', organizationId: 'org-1' },
        data: expect.objectContaining({ content: 'The zatrudniony signed.' }),
      }),
    );
  });

  it('takes the suggestion bodies from the stored job, not from the caller', async () => {
    // The caller sends ids only. Accepting before/after from the request would
    // let any client write arbitrary text into a version stamped AI_OPTIMIZE.
    await applySuggestionsCommand({
      ...input,
      // @ts-expect-error — proving the extra field is ignored if one is sent
      suggestions: [suggestion('s1', 'pracownik', 'INJECTED')],
    });

    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'The zatrudniony signed.' }),
    );
  });

  it('scopes the document lookup to the organization', async () => {
    await applySuggestionsCommand(input);

    expect(dbMock.userDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', organizationId: 'org-1' },
      }),
    );
  });

  it('rejects an id that is not in the stored job', async () => {
    await expect(
      applySuggestionsCommand({ ...input, acceptedSuggestionIds: ['ghost'] }),
    ).rejects.toThrow('No matching suggestions');
    expect(createVersion).not.toHaveBeenCalled();
  });

  it('refuses to record a version when nothing could be applied', async () => {
    dbMock.userDocument.findFirst.mockResolvedValue(
      documentWith('Unrelated text.', [
        suggestion('s1', 'no longer present', 'replacement'),
      ]),
    );

    await expect(applySuggestionsCommand(input)).rejects.toThrow(
      'No suggestions could be applied',
    );
    // A version recording no change would be noise in the history.
    expect(createVersion).not.toHaveBeenCalled();
    expect(dbMock.userDocument.updateMany).not.toHaveBeenCalled();
  });

  it('counts only the suggestions that actually landed', async () => {
    dbMock.userDocument.findFirst.mockResolvedValue(
      documentWith('alpha beta gamma', [
        suggestion('s1', 'alpha beta', 'ALPHA'),
        suggestion('s2', 'beta gamma', 'GAMMA'),
      ]),
    );

    await applySuggestionsCommand({
      ...input,
      acceptedSuggestionIds: ['s1', 's2'],
    });

    // s2's text was consumed by s1, so it went stale.
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: 'Applied 1 of 2 accepted suggestions',
      }),
    );
  });

  it('keeps undecided suggestions on the job and drops stale ones', async () => {
    dbMock.userDocument.findFirst.mockResolvedValue(
      documentWith('alpha beta gamma delta', [
        suggestion('s1', 'alpha beta', 'ALPHA'),
        suggestion('s2', 'beta gamma', 'GAMMA'),
        suggestion('s3', 'delta', 'DELTA'),
      ]),
    );

    await applySuggestionsCommand({
      ...input,
      acceptedSuggestionIds: ['s1', 's2'],
    });

    // s1 applied, s2 went stale — both gone. s3 was never decided, so it stays
    // available in the tab.
    const written = dbMock.$executeRaw.mock.calls[0];
    expect(JSON.stringify(written)).toContain('s3');
    expect(JSON.stringify(written)).not.toContain('"s2"');
  });

  it('ignores stored entries that do not match the suggestion shape', async () => {
    dbMock.userDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      content: 'The pracownik signed.',
      title: 'Doc',
      metadata: {
        optimizationJob: {
          suggestions: [
            { id: 's1', nonsense: true },
            suggestion('s2', 'pracownik', 'zatrudniony'),
          ],
        },
      },
    });

    // This JSONB is written by another process; a shape change there should not
    // surface halfway through rewriting someone's document.
    await expect(
      applySuggestionsCommand({ ...input, acceptedSuggestionIds: ['s1'] }),
    ).rejects.toThrow('No matching suggestions');
  });

  it('throws when the document is not in this organization', async () => {
    dbMock.userDocument.findFirst.mockResolvedValue(null);

    await expect(applySuggestionsCommand(input)).rejects.toThrow(
      'Document not found',
    );
  });
});

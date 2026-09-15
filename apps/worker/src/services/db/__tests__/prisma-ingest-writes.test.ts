// The ingest writes migrated in ADR-40 step 3d. Every one of them already
// appeared in a test — but in `activities.spec.ts` or `workflow.spec.ts`, which
// mock `db` at the boundary and so pass whatever the query does. These test
// the query.
//
// Two things here are contracts rather than implementation, and both would fail
// silently: the shape `createFileDetailsInDB` returns, which a workflow reads
// out of Temporal history, and which timestamp each status writer stamps.

/* eslint-disable no-var */
var mockUpdateMany: Mock;
var mockFileCreate: Mock;
var mockDocumentCreate: Mock;
var mockFileFindFirst: Mock;
var mockFileFindUnique: Mock;
/* eslint-enable no-var */

vi.mock('../prisma.js', () => {
  mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  mockFileCreate = vi.fn();
  mockDocumentCreate = vi.fn();
  mockFileFindFirst = vi.fn();
  mockFileFindUnique = vi.fn();
  return {
    getPrisma: () => ({
      userFile: {
        updateMany: mockUpdateMany,
        create: mockFileCreate,
        findFirst: mockFileFindFirst,
        findUnique: mockFileFindUnique,
      },
      userDocument: { create: mockDocumentCreate },
    }),
  };
});

import type { Mock } from 'vitest';
import { db, EmbeddingStatus, FileType, ParsingStatus } from '../index.js';
import { bindFileWithDocument } from '../db.js';

const WHERE = { where: { fileId: 'file-1', orgId: 'org-1' } };
/** Every one of these is scoped by file *and* org. */
const SCOPE = { id: 'file-1', organizationId: 'org-1' };

beforeEach(() => {
  mockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mockFileCreate.mockReset();
  mockDocumentCreate.mockReset();
  mockFileFindFirst.mockReset().mockResolvedValue({ ownerId: null });
  mockFileFindUnique.mockReset();
});

describe('the single-column file updates', () => {
  it.each([
    [
      'updateFileBinaryInfo',
      () => db.updateFileBinaryInfo({ ...WHERE, data: { isBinary: false } }),
      { isBinaryFile: false },
    ],
    [
      'updateFileType',
      () => db.updateFileType({ ...WHERE, data: { type: FileType.PDF } }),
      { fileType: FileType.PDF },
    ],
    [
      'updateFileSize',
      () => db.updateFileSize({ ...WHERE, data: { fileSize: 2048 } }),
      { fileSize: 2048 },
    ],
    [
      'updateWorkflowId',
      () => db.updateWorkflowId({ ...WHERE, data: { workflowId: 'wf-1' } }),
      { workflowId: 'wf-1' },
    ],
    [
      'updatePageCount',
      () => db.updatePageCount({ ...WHERE, data: { pageCount: 12 } }),
      { pageCount: 12 },
    ],
    [
      'updateLanguage',
      () => db.updateLanguage({ ...WHERE, data: { language: 'pol' } }),
      { language: 'pol' },
    ],
  ])(
    '%s writes its column, scoped to the file and the org',
    async (_name, call, data) => {
      await call();

      expect(mockUpdateMany).toHaveBeenCalledWith({ where: SCOPE, data });
    },
  );

  it('updateFileExtensionAndMime writes both columns at once', async () => {
    await db.updateFileExtensionAndMime({
      ...WHERE,
      data: { ext: 'pdf', mime: 'application/pdf' },
    });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: SCOPE,
      data: { fileExtension: 'pdf', fileMimeType: 'application/pdf' },
    });
  });

  it('bindFileWithDocument attaches the document to the file', async () => {
    await bindFileWithDocument('file-1', 'doc-1', 'org-1');

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: SCOPE,
      data: { documentId: 'doc-1' },
    });
  });

  it('returns the row count, so a caller can tell a miss from a write', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      db.updateLanguage({ ...WHERE, data: { language: null } }),
    ).resolves.toBe(0);
  });
});

describe('updateEmbeddingStatus', () => {
  const call = (embedding_status: EmbeddingStatus) =>
    db.updateEmbeddingStatus({ ...WHERE, data: { embedding_status } });

  it.each([
    [EmbeddingStatus.STARTED, 'embeddingStartedAt'],
    [EmbeddingStatus.COMPLETED, 'embeddingCompletedAt'],
    [EmbeddingStatus.FAILED, 'embeddingFailedAt'],
  ])('stamps %s with %s', async (status, column) => {
    await call(status);

    const { data } = mockUpdateMany.mock.calls[0][0];
    expect(data.embeddingStatus).toBe(status);
    expect(data[column]).toBeInstanceOf(Date);
  });

  // NOT_STARTED and CANCELLED deliberately stamp nothing — there is no column
  // for either, and inventing one would be a schema change.
  it.each([EmbeddingStatus.NOT_STARTED, EmbeddingStatus.CANCELLED])(
    'stamps no timestamp for %s',
    async (status) => {
      await call(status);

      const { data } = mockUpdateMany.mock.calls[0][0];
      expect(Object.keys(data)).toEqual(['embeddingStatus']);
    },
  );
});

describe('updateParsingStatus', () => {
  const call = (parsing_status: ParsingStatus) =>
    db.updateParsingStatus({ ...WHERE, data: { parsing_status } });

  it.each([
    [ParsingStatus.STARTED, 'parsingStartedAt'],
    [ParsingStatus.COMPLETED, 'parsingCompletedAt'],
    [ParsingStatus.FAILED, 'parsingFailedAt'],
  ])('stamps %s with %s', async (status, column) => {
    await call(status);

    const { data } = mockUpdateMany.mock.calls[0][0];
    expect(data.parsingStatus).toBe(status);
    expect(data[column]).toBeInstanceOf(Date);
  });

  it('stamps no timestamp for CANCELLED', async () => {
    await call(ParsingStatus.CANCELLED);

    expect(Object.keys(mockUpdateMany.mock.calls[0][0].data)).toEqual([
      'parsingStatus',
    ]);
  });
});

// The sticky-CANCELLED `where` clause. It is the whole reason a late activity
// cannot write COMPLETED over a cancellation — the status writers used to rely
// on ordering — and the STARTED exception is what keeps a cancelled file
// re-indexable. Remove either and every other test in this repository still
// passes: one leaves a cancelled ingest able to report success, the other makes
// `reembedFileCommand` fail silently, since it checks no status at all.
describe('CANCELLED is sticky, and STARTED is the one status through it', () => {
  it.each([
    EmbeddingStatus.COMPLETED,
    EmbeddingStatus.FAILED,
    EmbeddingStatus.NOT_STARTED,
  ])('refuses to write %s over a cancelled embedding', async (status) => {
    await db.updateEmbeddingStatus({
      ...WHERE,
      data: { embedding_status: status },
    });

    expect(mockUpdateMany.mock.calls[0][0].where).toEqual({
      ...SCOPE,
      embeddingStatus: { not: EmbeddingStatus.CANCELLED },
    });
  });

  it.each([
    ParsingStatus.COMPLETED,
    ParsingStatus.FAILED,
    ParsingStatus.NOT_STARTED,
  ])('refuses to write %s over a cancelled parse', async (status) => {
    await db.updateParsingStatus({
      ...WHERE,
      data: { parsing_status: status },
    });

    expect(mockUpdateMany.mock.calls[0][0].where).toEqual({
      ...SCOPE,
      parsingStatus: { not: ParsingStatus.CANCELLED },
    });
  });

  // A re-ingest opens by writing STARTED. Blocking it too would make
  // cancellation permanent, and nothing on the re-embed path checks a status,
  // so the user would be told the re-index started when it had not.
  it('lets a new run reset a cancelled embedding with STARTED', async () => {
    await db.updateEmbeddingStatus({
      ...WHERE,
      data: { embedding_status: EmbeddingStatus.STARTED },
    });

    expect(mockUpdateMany.mock.calls[0][0].where).toEqual(SCOPE);
  });

  it('lets a new run reset a cancelled parse with STARTED', async () => {
    await db.updateParsingStatus({
      ...WHERE,
      data: { parsing_status: ParsingStatus.STARTED },
    });

    expect(mockUpdateMany.mock.calls[0][0].where).toEqual(SCOPE);
  });

  it('still scopes every one of those writes by org', async () => {
    await db.updateParsingStatus({
      ...WHERE,
      data: { parsing_status: ParsingStatus.COMPLETED },
    });

    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
    });
  });
});

// The read behind every cancellation checkpoint. It runs about five times per
// ingest, which is why it reads the unique key rather than `workflow_id`.
describe('isIngestCancelled', () => {
  it('reads the unique key, not the run id', async () => {
    mockFileFindUnique.mockResolvedValue({
      parsingStatus: ParsingStatus.STARTED,
      embeddingStatus: EmbeddingStatus.NOT_STARTED,
    });

    await db.isIngestCancelled('file-1', 'org-1');

    expect(mockFileFindUnique.mock.calls[0][0].where).toEqual({
      id_organizationId: { id: 'file-1', organizationId: 'org-1' },
    });
  });

  // Either column counts: the cancel command writes to whichever phase was
  // live, so a pipeline that has moved on to embedding must still see a
  // cancellation recorded against the phase it left.
  it.each([
    [
      'a cancelled parse',
      {
        parsingStatus: ParsingStatus.CANCELLED,
        embeddingStatus: EmbeddingStatus.NOT_STARTED,
      },
    ],
    [
      'a cancelled embedding',
      {
        parsingStatus: ParsingStatus.COMPLETED,
        embeddingStatus: EmbeddingStatus.CANCELLED,
      },
    ],
  ])('reports cancelled for %s', async (_label, row) => {
    mockFileFindUnique.mockResolvedValue(row);

    expect(await db.isIngestCancelled('file-1', 'org-1')).toBe(true);
  });

  it('reports not cancelled for a run in flight', async () => {
    mockFileFindUnique.mockResolvedValue({
      parsingStatus: ParsingStatus.STARTED,
      embeddingStatus: EmbeddingStatus.NOT_STARTED,
    });

    expect(await db.isIngestCancelled('file-1', 'org-1')).toBe(false);
  });

  // Deleting a file mid-ingest is a stronger statement than cancelling it. The
  // alternative is a pipeline embedding chunks against a row that is gone.
  it('treats a missing row as cancelled', async () => {
    mockFileFindUnique.mockResolvedValue(null);

    expect(await db.isIngestCancelled('file-1', 'org-1')).toBe(true);
  });
});

describe('createFileDetailsInDB', () => {
  beforeEach(() => {
    mockFileCreate.mockResolvedValue({
      id: 'file-1',
      fileName: 'report.pdf',
      organizationId: 'org-1',
      projectId: 'proj-1',
    });
  });

  const call = () =>
    db.createFileDetailsInDB({
      file_name: 'report.pdf',
      file_size: 2048,
      organization_id: 'org-1',
      file_type: FileType.PDF,
      project_id: 'proj-1',
    });

  // This is an activity result a workflow reads back out of Temporal history:
  // `scrape-website.ts` destructures the array and reads `file_name`,
  // `organization_id` and `project_id`. Renaming them is a
  // workflow-compatibility change, not a rename, so the contract is pinned.
  it('returns the snake_case shape the workflow reads, in an array', async () => {
    await expect(call()).resolves.toEqual([
      {
        id: 'file-1',
        file_name: 'report.pdf',
        organization_id: 'org-1',
        project_id: 'proj-1',
      },
    ]);
  });

  it('writes the row with the schema field names', async () => {
    await call();

    expect(mockFileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fileName: 'report.pdf',
          fileSize: 2048,
          organizationId: 'org-1',
          fileType: FileType.PDF,
          projectId: 'proj-1',
        },
      }),
    );
  });
});

describe('createMarkdownDocument', () => {
  beforeEach(() => {
    mockDocumentCreate.mockResolvedValue({ id: 'doc-1' });
  });

  const call = () =>
    db.createMarkdownDocument({
      title: 'doc.md',
      content: '# Hello',
      orgId: 'org-1',
      fileId: 'file-1',
      projectId: 'proj-1',
    });

  it('returns the id in an array, because two workflows destructure it', async () => {
    await expect(call()).resolves.toEqual([{ id: 'doc-1' }]);
  });

  // The column has no DB-side default, but the schema declares
  // `@default(uuid())`, which Prisma generates client-side — so the id no
  // longer has to be passed by every writer that remembers to.
  it('lets Prisma supply the id rather than passing one', async () => {
    await call();

    const { data } = mockDocumentCreate.mock.calls[0][0];
    expect(data).not.toHaveProperty('id');
    expect(data).toEqual({
      ownerId: null,
      title: 'doc.md',
      content: '# Hello',
      organizationId: 'org-1',
      fileId: 'file-1',
      projectId: 'proj-1',
    });
  });

  // The document keeps its own owner so that deleting the file cannot widen
  // access to it: `user_documents.file_id` is ON DELETE SET NULL, and a
  // document with no file used to be readable by the whole organization.
  it('copies the owner from the file it was ingested from', async () => {
    mockFileFindFirst.mockResolvedValue({ ownerId: 'user-7' });

    await call();

    expect(mockFileFindFirst).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      select: { ownerId: true },
    });
    expect(mockDocumentCreate.mock.calls[0][0].data).toMatchObject({
      ownerId: 'user-7',
    });
  });

  it('leaves the owner null when the file has none', async () => {
    mockFileFindFirst.mockResolvedValue({ ownerId: null });

    await call();

    expect(mockDocumentCreate.mock.calls[0][0].data).toMatchObject({
      ownerId: null,
    });
  });
});

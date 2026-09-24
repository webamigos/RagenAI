import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockThreadFindFirst = vi.hoisted(() => vi.fn());
const mockMessageFindMany = vi.hoisted(() => vi.fn());
const mockProjectFindUnique = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: { findFirst: mockThreadFindFirst },
    message: { findMany: mockMessageFindMany },
    project: { findUnique: mockProjectFindUnique },
  },
}));

// No DEK in these fixtures, so the real implementation would pass rows
// through untouched anyway. Mocked so the suite never reaches for a KMS
// client on a machine that has none.
vi.mock('@ragenai/crypto', () => ({
  decryptMessageContents: vi.fn(async (rows: unknown[]) => rows),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getThreadMessagesQuery } from '../get-thread-messages-query';

const THREAD_ID = 'thread-1';
const VISITOR_ID = 'visitor-1';

type RetrievalFixture = {
  fileId: string;
  rank: number;
  snippet: string | null;
  sourcePage?: number | null;
  sourceRegions?: unknown;
  file: { fileName: string | null } | null;
};

const answer = (overrides: {
  documentRetrievals: RetrievalFixture[];
  documentCitations: { fileId: string }[];
}) => ({
  id: 'm1',
  createdAt: new Date('2026-09-10T08:00:00Z'),
  content: 'The limit is 50 MB [1].',
  role: 'ASSISTANT',
  runId: 'r1',
  rate: null,
  voiceDurationSeconds: null,
  messageType: 'TEXT',
  voicePlayed: false,
  attachments: null,
  metadata: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockThreadFindFirst.mockResolvedValue({
    id: THREAD_ID,
    encryptedDek: null,
    mentionedProjectId: null,
    project: { id: 'p1', title: 'Project' },
  });
});

const run = () => getThreadMessagesQuery(THREAD_ID, VISITOR_ID);

describe('getThreadMessagesQuery — persisted retrieval', () => {
  it('shapes stored retrievals and citations into the sources block contract', async () => {
    mockMessageFindMany.mockResolvedValue([
      answer({
        documentRetrievals: [
          {
            fileId: 'a',
            rank: 1,
            snippet: 'quote',
            file: { fileName: 'umowa.pdf' },
          },
          {
            fileId: 'b',
            rank: 2,
            snippet: null,
            file: { fileName: 'polityka.pdf' },
          },
        ],
        documentCitations: [{ fileId: 'a' }],
      }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval).toEqual({
      sources: [
        // The quote travels with the source that has one; a row whose chunk
        // had no text carries no key at all, rather than an empty string the
        // card would render as a blank quotation.
        { fileId: 'a', fileName: 'umowa.pdf', snippet: 'quote' },
        { fileId: 'b', fileName: 'polityka.pdf' },
      ],
      citedFileIds: ['a'],
    });
  });

  it('reads back the page and regions, so a reopened source opens where the live one did', async () => {
    const region = { page: 4, x: 0.1, y: 0.3, w: 0.8, h: 0.05 };
    mockMessageFindMany.mockResolvedValue([
      answer({
        documentRetrievals: [
          {
            fileId: 'a',
            rank: 1,
            snippet: 'quote',
            sourcePage: 4,
            sourceRegions: [region],
            file: { fileName: 'umowa.pdf' },
          },
        ],
        documentCitations: [],
      }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval?.sources[0]).toEqual({
      fileId: 'a',
      fileName: 'umowa.pdf',
      snippet: 'quote',
      sourcePage: 4,
      sourceRegions: [region],
    });
  });

  it('asks the database for the two columns', async () => {
    mockMessageFindMany.mockResolvedValue([]);
    await run();

    const select =
      mockMessageFindMany.mock.calls[0][0].select.documentRetrievals.select;
    expect(select).toMatchObject({ sourcePage: true, sourceRegions: true });
  });

  it('drops a stored page or region that is not one, rather than passing it on', async () => {
    // A JSON column is as untyped as the payload it was copied from.
    mockMessageFindMany.mockResolvedValue([
      answer({
        documentRetrievals: [
          {
            fileId: 'a',
            rank: 1,
            snippet: null,
            sourcePage: 0,
            sourceRegions: [
              { page: 2, x: 'left', y: 0, w: 1, h: 1 },
              { page: 2, x: 0.9, y: 0, w: 0.9, h: 0.1 },
              { page: 2, x: 0, y: 0, w: 1, h: 0.1 },
            ],
            file: { fileName: 'umowa.pdf' },
          },
          {
            fileId: 'b',
            rank: 2,
            snippet: null,
            sourcePage: null,
            sourceRegions: { not: 'an array' },
            file: { fileName: 'b.pdf' },
          },
        ],
        documentCitations: [],
      }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval?.sources).toEqual([
      {
        fileId: 'a',
        fileName: 'umowa.pdf',
        sourceRegions: [{ page: 2, x: 0, y: 0, w: 1, h: 0.1 }],
      },
      // An older row: neither key, so the viewer finds the passage by text.
      { fileId: 'b', fileName: 'b.pdf' },
    ]);
  });

  it('keeps rank order, because it is the numbering the answer cites', async () => {
    // Prisma is asked for `rank: 'asc'`, so this fixture is what it returns;
    // the assertion is that nothing downstream re-sorts or reverses it.
    mockMessageFindMany.mockResolvedValue([
      answer({
        documentRetrievals: [
          {
            fileId: 'first',
            rank: 1,
            snippet: null,
            file: { fileName: 'b.pdf' },
          },
          {
            fileId: 'second',
            rank: 2,
            snippet: null,
            file: { fileName: 'a.pdf' },
          },
        ],
        documentCitations: [],
      }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval?.sources.map((s) => s.fileId)).toEqual([
      'first',
      'second',
    ]);
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          documentRetrievals: expect.objectContaining({
            orderBy: { rank: 'asc' },
          }),
        }),
      }),
    );
  });

  it('carries a retrieval whose file lost its name rather than dropping the row', async () => {
    // Dropping it would make the numbering disagree with what the answer
    // cited — every `[n]` after the gap would point one row too far.
    mockMessageFindMany.mockResolvedValue([
      answer({
        documentRetrievals: [
          { fileId: 'a', rank: 1, snippet: null, file: null },
          { fileId: 'b', rank: 2, snippet: null, file: { fileName: null } },
        ],
        documentCitations: [],
      }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval?.sources).toEqual([
      { fileId: 'a', fileName: null },
      { fileId: 'b', fileName: null },
    ]);
  });

  it('drops a citation whose file is not in the retrieved set', async () => {
    mockMessageFindMany.mockResolvedValue([
      answer({
        documentRetrievals: [
          {
            fileId: 'a',
            rank: 1,
            snippet: null,
            file: { fileName: 'umowa.pdf' },
          },
        ],
        documentCitations: [{ fileId: 'a' }, { fileId: 'gone' }],
      }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval?.citedFileIds).toEqual(['a']);
  });

  it('leaves retrieval undefined when the turn stored none', async () => {
    // Not an empty block: a turn that never searched and a turn that searched
    // and matched nothing both write no rows, so the honest render is none.
    mockMessageFindMany.mockResolvedValue([
      answer({ documentRetrievals: [], documentCitations: [] }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval).toBeUndefined();
  });

  it('puts the decrypted snippet on the source, for the card to quote', async () => {
    // This asserted the opposite until the card existed. The snippet was
    // decrypted server-side and dropped here, because shipping 2 KB of
    // verbatim document text per source to a client that rendered none of it
    // was payload for nothing. The source card quotes it now, so the same
    // reasoning points the other way — and the reader is the one who asked
    // the question and can open the document.
    mockMessageFindMany.mockResolvedValue([
      answer({
        documentRetrievals: [
          {
            fileId: 'a',
            rank: 1,
            snippet: 'a verbatim extract',
            file: { fileName: 'umowa.pdf' },
          },
        ],
        documentCitations: [],
      }),
    ]);

    const { messages } = await run();

    expect(messages[0].retrieval?.sources[0].snippet).toBe(
      'a verbatim extract',
    );
    expect(messages[0]).not.toHaveProperty('documentRetrievals');
    expect(messages[0]).not.toHaveProperty('documentCitations');
  });
});

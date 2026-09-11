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
        { fileId: 'a', fileName: 'umowa.pdf' },
        { fileId: 'b', fileName: 'polityka.pdf' },
      ],
      citedFileIds: ['a'],
    });
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

  it('does not put snippets on the wire', async () => {
    // They are decrypted server-side for the quote drawer that does not exist
    // yet. Shipping 2 KB of verbatim document text per source to a client
    // that renders none of it is payload and exposure for nothing.
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

    expect(JSON.stringify(messages)).not.toContain('a verbatim extract');
    expect(messages[0]).not.toHaveProperty('documentRetrievals');
    expect(messages[0]).not.toHaveProperty('documentCitations');
  });
});

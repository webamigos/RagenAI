import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.hoisted`, because `vi.mock` is lifted above every declaration in the
// file and a plain `const` above it is still in its temporal dead zone when
// the factory runs.
const { documentRetrievalCreateMany, documentCitationCreateMany, transaction } =
  vi.hoisted(() => ({
    // Parameters declared, even though unused: a `vi.fn(() => …)` has an empty
    // tuple for its arguments, and `mock.calls[0][0]` is then a type error
    // rather than the assertion it looks like.
    documentRetrievalCreateMany: vi.fn((_args: unknown) => ({
      __op: 'retrievals',
    })),
    documentCitationCreateMany: vi.fn((_args: unknown) => ({
      __op: 'citations',
    })),
    transaction: vi.fn(async (_operations: unknown[]) => []),
  }));

const { mockEncrypt } = vi.hoisted(() => ({
  mockEncrypt: vi.fn(async (_threadId: string, content: string) => content),
}));

// The point of mocking this rather than the crypto primitives: the guarantee
// gap 5 asks for is that a snippet goes through *the same function the message
// went through*, so what is worth asserting is the call, not the ciphertext.
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/features/messages/services/thread-content-encryption', () => ({
  maybeEncryptContent: mockEncrypt,
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentRetrieval: { createMany: documentRetrievalCreateMany },
    documentCitation: { createMany: documentCitationCreateMany },
    $transaction: transaction,
  },
}));

import { recordKnowledgeUsageCommand } from '../record-knowledge-usage-command';

const MESSAGE_ID = 'msg-1';
const ORG_ID = 'org-1';

/** Named so `selectCitedSources` can find them in an answer by name. */
const HANDBOOK = {
  fileId: 'file-handbook',
  fileName: 'employee-handbook.pdf',
  snippet: 'Pracownikowi przysluguje 26 dni urlopu.',
};
const FAQ = { fileId: 'file-faq', fileName: 'customer-faq.pdf' };
const PRICING = { fileId: 'file-pricing', fileName: 'pricing-2026.pdf' };

function retrievalRows() {
  return documentRetrievalCreateMany.mock.calls[0][0] as {
    data: { messageId: string; fileId: string; orgId: string; rank: number }[];
    skipDuplicates: boolean;
  };
}

function citationRows() {
  return documentCitationCreateMany.mock.calls[0][0] as {
    data: { messageId: string; fileId: string; orgId: string }[];
    skipDuplicates: boolean;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordKnowledgeUsageCommand', () => {
  it('writes a row per retrieved file, ranked by position', async () => {
    await recordKnowledgeUsageCommand(
      MESSAGE_ID,
      ORG_ID,
      [HANDBOOK, FAQ, PRICING],
      'See employee-handbook.pdf for the answer.',
      'thread-1',
    );

    // The rank is the position after dedupe and rerank, which the caller
    // already has and nothing downstream can reconstruct.
    expect(retrievalRows().data).toEqual([
      {
        messageId: MESSAGE_ID,
        fileId: 'file-handbook',
        orgId: ORG_ID,
        rank: 1,
        snippet: HANDBOOK.snippet,
      },
      {
        messageId: MESSAGE_ID,
        fileId: 'file-faq',
        orgId: ORG_ID,
        rank: 2,
        snippet: null,
      },
      {
        messageId: MESSAGE_ID,
        fileId: 'file-pricing',
        orgId: ORG_ID,
        rank: 3,
        snippet: null,
      },
    ]);
  });

  describe('the snippet', () => {
    it('goes through the same encryptor the message went through', () => {
      // The guarantee gap 5 asks for is not "encrypted" but "encrypted the
      // same way": a snippet is a verbatim extract of a document sitting
      // beside the answer that quotes it. Calling the same function is what
      // makes the two impossible to diverge.
      return recordKnowledgeUsageCommand(
        MESSAGE_ID,
        ORG_ID,
        [HANDBOOK],
        'See employee-handbook.pdf.',
        'thread-1',
      ).then(() => {
        expect(mockEncrypt).toHaveBeenCalledWith('thread-1', HANDBOOK.snippet);
      });
    });

    it('is null, not an empty string, when the chunk had no text', async () => {
      // A source card renders a quote when there is one and omits it
      // otherwise; an empty string would render an empty quote.
      await recordKnowledgeUsageCommand(
        MESSAGE_ID,
        ORG_ID,
        [FAQ],
        'Nothing cited.',
        'thread-1',
      );

      expect(retrievalRows().data[0]).toMatchObject({ snippet: null });
      expect(mockEncrypt).not.toHaveBeenCalled();
    });

    it('keeps the row when the key is unavailable, losing only the quote', async () => {
      // Before snippets existed this command never touched KMS, so an
      // unavailable key would newly have cost the whole turn's analytics —
      // the rows carry rank and drive the citation metrics.
      mockEncrypt.mockRejectedValueOnce(new Error('KMS unavailable'));

      await recordKnowledgeUsageCommand(
        MESSAGE_ID,
        ORG_ID,
        [HANDBOOK, FAQ],
        'See employee-handbook.pdf.',
        'thread-1',
      );

      expect(retrievalRows().data).toHaveLength(2);
      expect(retrievalRows().data[0]).toMatchObject({ snippet: null });
    });

    it('never stores the plaintext when encryption fails', async () => {
      // Storing the text unencrypted beside a message that *was* encrypted is
      // the divergence ADR-42 exists to prevent, and it would be invisible: a
      // readable snippet looks like a working feature.
      mockEncrypt.mockRejectedValueOnce(new Error('KMS unavailable'));

      await recordKnowledgeUsageCommand(
        MESSAGE_ID,
        ORG_ID,
        [HANDBOOK],
        'See employee-handbook.pdf.',
        'thread-1',
      );

      expect(retrievalRows().data[0]).not.toMatchObject({
        snippet: HANDBOOK.snippet,
      });
      expect(retrievalRows().data[0]).toMatchObject({ snippet: null });
    });

    it('encrypts before opening the transaction', async () => {
      // `maybeEncryptContent` reads the thread and can create its key. Holding
      // a transaction open across that is a lock held for a KMS round-trip.
      const order: string[] = [];
      mockEncrypt.mockImplementationOnce(async (_t, c) => {
        order.push('encrypt');
        return c;
      });
      transaction.mockImplementationOnce(async () => {
        order.push('transaction');
        return [];
      });

      await recordKnowledgeUsageCommand(
        MESSAGE_ID,
        ORG_ID,
        [HANDBOOK],
        'See employee-handbook.pdf.',
        'thread-1',
      );

      expect(order).toEqual(['encrypt', 'transaction']);
    });
  });

  it('cites only what the answer names, while recording everything shown', async () => {
    await recordKnowledgeUsageCommand(
      MESSAGE_ID,
      ORG_ID,
      [HANDBOOK, FAQ, PRICING],
      'See employee-handbook.pdf for the answer.',
      'thread-1',
    );

    // The whole reason both tables exist: three shown, one used. Against
    // citations alone, the other two are indistinguishable from documents
    // nobody ever asks about.
    expect(retrievalRows().data).toHaveLength(3);
    expect(citationRows().data.map((row) => row.fileId)).toEqual([
      'file-handbook',
    ]);
  });

  it('still records the retrieval when the answer cited nothing', async () => {
    await recordKnowledgeUsageCommand(
      MESSAGE_ID,
      ORG_ID,
      [HANDBOOK, FAQ],
      'I could not find anything about that.',
      'thread-1',
    );

    // An answer that cited nothing is a metric, not an absence — Phase D
    // reports exactly these turns. Skipping the write here is what would make
    // it unanswerable.
    expect(retrievalRows().data).toHaveLength(2);
    expect(citationRows().data).toEqual([]);
  });

  it('writes both tables in one transaction', async () => {
    await recordKnowledgeUsageCommand(
      MESSAGE_ID,
      ORG_ID,
      [HANDBOOK],
      'See employee-handbook.pdf.',
      'thread-1',
    );

    // Not two awaited calls. A process dying between them leaves the turn
    // reading as "retrieved and never cited", which over-reports the one
    // metric this table was added to produce.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0]).toEqual([
      { __op: 'retrievals' },
      { __op: 'citations' },
    ]);
  });

  it('is safe to replay, so a retry cannot double-count', async () => {
    await recordKnowledgeUsageCommand(
      MESSAGE_ID,
      ORG_ID,
      [HANDBOOK],
      'See employee-handbook.pdf.',
      'thread-1',
    );

    // Both tables are unique on (messageId, fileId); without this a retried
    // write would throw rather than no-op.
    expect(retrievalRows().skipDuplicates).toBe(true);
    expect(citationRows().skipDuplicates).toBe(true);
  });

  it('touches the database not at all when nothing was retrieved', async () => {
    await recordKnowledgeUsageCommand(MESSAGE_ID, ORG_ID, [], 'Hello.', 't1');

    expect(transaction).not.toHaveBeenCalled();
  });
});

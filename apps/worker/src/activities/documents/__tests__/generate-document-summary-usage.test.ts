import { describe, expect, it, vi } from 'vitest';

/**
 * Kept apart from `generate-document-summary.test.ts`, which leaves the db
 * module real: asserting on the usage row needs it mocked.
 */

const trackAiUsage = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../../services/db/db.js', () => ({ db: { trackAiUsage } }));
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({
    text: 'A summary.',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  })),
}));
vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn(async () => 'mock-model'),
}));
vi.mock('../../../services/langfuse-trace.js', () => ({
  withLangfuseTrace: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { generateDocumentSummary } =
  await import('../generate-document-summary.js');

describe('generateDocumentSummary usage', () => {
  // The message ceiling counts CHAT_COMPLETION rows. Recorded as one, every
  // uploaded document spent a chat message the organization never sent.
  it('records its usage under DOCUMENT_PROCESSING, not as a chat completion', async () => {
    await generateDocumentSummary({
      documentText: 'Invoices for Polish clients.',
      orgId: 'org-1',
      fileName: 'invoices.pdf',
    });
    expect(trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'DOCUMENT_PROCESSING',
        metadata: expect.objectContaining({ kind: 'document_summary' }),
      }),
    );
  });
});

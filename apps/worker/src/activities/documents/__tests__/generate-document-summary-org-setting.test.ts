import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The organization's `docSummariesEnabled` at ingest (spec
 * 2026-10-03-retrieval-claims, A1): a summary is written when the env flag
 * AND the organization allow it, and a failed read of the setting generates
 * it, as before the setting was read.
 */

const m = vi.hoisted(() => ({
  isOrgDocSummariesEnabled: vi.fn(),
  generateText: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../services/db/db.js', () => ({
  db: {
    trackAiUsage: vi.fn(async () => undefined),
    isOrgDocSummariesEnabled: m.isOrgDocSummariesEnabled,
  },
}));
vi.mock('ai', () => ({ generateText: m.generateText }));
vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn(async () => 'mock-model'),
}));
vi.mock('../../../services/langfuse-trace.js', () => ({
  withLangfuseTrace: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: m.warn, error: vi.fn(), debug: vi.fn() },
}));

const { generateDocumentSummary } =
  await import('../generate-document-summary.js');

const input = {
  documentText: 'Service agreement terms for the X tender.',
  orgId: 'org-1',
  fileName: 'agreement.pdf',
};

describe('generateDocumentSummary — the organization setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // On explicitly, so a FEATURE_FLAG_DOC_SUMMARIES=0 in the environment
    // running the suite cannot make the organization branches pass unread.
    vi.stubEnv('FEATURE_FLAG_DOC_SUMMARIES', '1');
    m.generateText.mockResolvedValue({
      text: 'A service agreement.',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  it('writes a summary when the env flag and the organization both allow it', async () => {
    m.isOrgDocSummariesEnabled.mockResolvedValue(true);

    await expect(generateDocumentSummary(input)).resolves.toBe(
      'A service agreement.',
    );
    expect(m.isOrgDocSummariesEnabled).toHaveBeenCalledWith('org-1');
  });

  it('writes nothing and calls no model when the organization has it off', async () => {
    m.isOrgDocSummariesEnabled.mockResolvedValue(false);

    await expect(generateDocumentSummary(input)).resolves.toBe('');
    expect(m.isOrgDocSummariesEnabled).toHaveBeenCalledWith('org-1');
    expect(m.generateText).not.toHaveBeenCalled();
  });

  it('does not read the setting when the env flag is off', async () => {
    vi.stubEnv('FEATURE_FLAG_DOC_SUMMARIES', '0');

    await expect(generateDocumentSummary(input)).resolves.toBe('');
    expect(m.isOrgDocSummariesEnabled).not.toHaveBeenCalled();
    expect(m.generateText).not.toHaveBeenCalled();
  });

  it('generates the summary, and warns, when the setting cannot be read', async () => {
    m.isOrgDocSummariesEnabled.mockRejectedValue(new Error('db down'));

    await expect(generateDocumentSummary(input)).resolves.toBe(
      'A service agreement.',
    );
    expect(m.warn).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', err: 'db down' }),
      expect.stringContaining('could not read docSummariesEnabled'),
    );
  });
});

import { generateDocumentSummary } from '../generate-document-summary';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('../../../services/llm/provider', () => ({
  getChatModelForOrg: jest.fn().mockResolvedValue('mock-model'),
}));

jest.mock('../../../services/langfuse-trace', () => ({
  withLangfuseTrace: jest.fn((_opts: unknown, fn: () => unknown) => fn()),
}));

jest.mock('../../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateText } = require('ai') as { generateText: jest.Mock };

function mockSummary(text: string) {
  generateText.mockResolvedValue({ text });
}

describe('generateDocumentSummary', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.FEATURE_FLAG_DOC_SUMMARIES;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns generated summary on happy path', async () => {
    mockSummary('This document covers invoice processing for Polish clients.');

    const result = await generateDocumentSummary({
      documentText: 'Long document content about invoices...',
      orgId: 'org-1',
      fileName: 'invoices.pdf',
    });

    expect(result).toBe(
      'This document covers invoice processing for Polish clients.',
    );
    expect(generateText).toHaveBeenCalledTimes(1);
    const callArgs = generateText.mock.calls[0][0];
    expect(callArgs.system).toContain('summarization');
    expect(callArgs.prompt).toContain('invoices.pdf');
    expect(callArgs.prompt).toContain('Long document content');
  });

  it('trims whitespace from LLM output', async () => {
    mockSummary('  \n  Summary text.  \n\n  ');

    const result = await generateDocumentSummary({
      documentText: 'content',
      orgId: 'org-1',
    });

    expect(result).toBe('Summary text.');
  });

  it('returns empty string on LLM error (graceful fallback)', async () => {
    generateText.mockRejectedValue(new Error('LiteLLM rate limit'));

    const result = await generateDocumentSummary({
      documentText: 'content',
      orgId: 'org-1',
    });

    expect(result).toBe('');
  });

  it('returns empty string when LLM returns empty text', async () => {
    mockSummary('');

    const result = await generateDocumentSummary({
      documentText: 'content',
      orgId: 'org-1',
    });

    expect(result).toBe('');
  });

  it('returns empty string for empty input without calling LLM', async () => {
    const result = await generateDocumentSummary({
      documentText: '',
      orgId: 'org-1',
    });

    expect(result).toBe('');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('returns empty string for whitespace-only input without calling LLM', async () => {
    const result = await generateDocumentSummary({
      documentText: '   \n\n   ',
      orgId: 'org-1',
    });

    expect(result).toBe('');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('skips LLM call when feature flag is "0"', async () => {
    process.env.FEATURE_FLAG_DOC_SUMMARIES = '0';

    const result = await generateDocumentSummary({
      documentText: 'content to summarize',
      orgId: 'org-1',
    });

    expect(result).toBe('');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('skips LLM call when feature flag is "false" (case insensitive)', async () => {
    process.env.FEATURE_FLAG_DOC_SUMMARIES = 'FALSE';

    const result = await generateDocumentSummary({
      documentText: 'content',
      orgId: 'org-1',
    });

    expect(result).toBe('');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('enables summaries when feature flag is unset (default on)', async () => {
    mockSummary('summary');
    delete process.env.FEATURE_FLAG_DOC_SUMMARIES;

    const result = await generateDocumentSummary({
      documentText: 'content',
      orgId: 'org-1',
    });

    expect(result).toBe('summary');
    expect(generateText).toHaveBeenCalled();
  });

  it('truncates very long input before sending to LLM', async () => {
    mockSummary('short summary');
    // 100k chars = 2x the 50k cap
    const longText = 'a'.repeat(100_000);

    await generateDocumentSummary({
      documentText: longText,
      orgId: 'org-1',
    });

    const callArgs = generateText.mock.calls[0][0];
    // prompt contains the truncated text plus the "Document content:" prefix
    // and optionally a file-name hint; the truncated body must not exceed
    // MAX_INPUT_CHARS (50_000)
    const aCount = (callArgs.prompt.match(/a/g) || []).length;
    expect(aCount).toBe(50_000);
  });

  it('omits file name hint when fileName is not provided', async () => {
    mockSummary('summary');

    await generateDocumentSummary({
      documentText: 'content',
      orgId: 'org-1',
    });

    const callArgs = generateText.mock.calls[0][0];
    expect(callArgs.prompt).not.toContain('File name:');
  });
});

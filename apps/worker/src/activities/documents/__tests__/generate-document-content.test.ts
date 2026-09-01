import { generateDocumentContent } from '../generate-document-content';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('../../../services/llm/provider', () => ({
  getChatModelForOrg: jest.fn().mockResolvedValue('mock-model'),
}));

jest.mock('../../../services/langfuse-trace', () => ({
  withLangfuseTrace: jest.fn((_opts: unknown, fn: () => unknown) => fn()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateText } = require('ai') as { generateText: jest.Mock };

function mockTextResult(text: string) {
  generateText.mockResolvedValue({ text });
}

describe('generateDocumentContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed sections from LLM response', async () => {
    const expectedSections = [
      {
        title: 'Workshop Summary — Test Client',
        content: 'Overview.',
        level: 1,
      },
      { title: 'Key Points', content: 'Point 1.\n\nPoint 2.', level: 2 },
    ];

    mockTextResult(JSON.stringify(expectedSections));

    const result = await generateDocumentContent({
      templateName: 'workshop-summary',
      rawInput: { content: 'Some workshop notes here' },
      clientName: 'Test Client',
      orgId: 'org-1',
    });

    expect(result).toEqual(expectedSections);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Test Client'),
      }),
    );
  });

  it('handles rawInput with string content field', async () => {
    const sections = [{ title: 'Title', content: 'Body.', level: 1 }];
    mockTextResult(JSON.stringify(sections));

    await generateDocumentContent({
      templateName: 'workshop-summary',
      rawInput: { content: 'Direct string content' },
      clientName: 'Client',
      orgId: 'org-1',
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Direct string content'),
      }),
    );
  });

  it('handles rawInput without string content (JSON fallback)', async () => {
    const sections = [{ title: 'Title', content: 'Body.', level: 1 }];
    mockTextResult(JSON.stringify(sections));

    await generateDocumentContent({
      templateName: 'workshop-summary',
      rawInput: { notes: ['item1', 'item2'], date: '2026-03-20' },
      clientName: 'Client',
      orgId: 'org-1',
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('item1'),
      }),
    );
  });

  it('throws on invalid LLM response', async () => {
    mockTextResult('not valid json');

    await expect(
      generateDocumentContent({
        templateName: 'workshop-summary',
        rawInput: { content: 'Notes' },
        clientName: 'Client',
        orgId: 'org-1',
      }),
    ).rejects.toThrow();
  });

  it('throws on malformed section object', async () => {
    mockTextResult(JSON.stringify([{ title: 'Section 1' }]));

    await expect(
      generateDocumentContent({
        templateName: 'workshop-summary',
        rawInput: { content: 'Notes' },
        clientName: 'Client',
        orgId: 'org-1',
      }),
    ).rejects.toThrow('LLM returned invalid document structure');
  });

  it('throws on empty array response', async () => {
    mockTextResult('[]');

    await expect(
      generateDocumentContent({
        templateName: 'workshop-summary',
        rawInput: { content: 'Notes' },
        clientName: 'Client',
        orgId: 'org-1',
      }),
    ).rejects.toThrow('LLM returned invalid document structure');
  });
});

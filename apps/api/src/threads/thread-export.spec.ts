import { Role } from '../generated/prisma/client.js';
import { serializeToMarkdown, buildExportFilename } from './thread-export.js';

describe('serializeToMarkdown', () => {
  it('renders title, date, assistant, and role-labeled messages', () => {
    const markdown = serializeToMarkdown({
      title: 'My Thread',
      createdAt: new Date('2026-01-15T10:30:00Z'),
      assistantName: 'Support Bot',
      messages: [
        {
          role: Role.USER,
          content: 'Hello',
          createdAt: new Date('2026-01-15T10:30:00Z'),
        },
        {
          role: Role.ASSISTANT,
          content: 'Hi there',
          createdAt: new Date('2026-01-15T10:31:00Z'),
        },
      ],
      sources: [{ fileName: 'doc.pdf' }],
    });

    expect(markdown).toContain('# My Thread');
    expect(markdown).toContain('Assistant: Support Bot');
    expect(markdown).toContain('**User**');
    expect(markdown).toContain('**Assistant**');
    expect(markdown).toContain('## Sources');
    expect(markdown).toContain('- doc.pdf');
  });

  it('falls back to defaults and a no-messages placeholder', () => {
    const markdown = serializeToMarkdown({
      title: null,
      createdAt: new Date('2026-01-15T10:30:00Z'),
      assistantName: null,
      messages: [],
      sources: [],
    });

    expect(markdown).toContain('# Conversation');
    expect(markdown).toContain('Assistant: —');
    expect(markdown).toContain('_No messages._');
    expect(markdown).not.toContain('## Sources');
  });
});

describe('buildExportFilename', () => {
  it('slugifies and transliterates Polish characters', () => {
    const filename = buildExportFilename(
      'Zażółć gęślą jaźń',
      new Date('2026-01-15T00:00:00Z'),
      'md',
    );
    expect(filename).toBe('zazolc-gesla-jazn-2026-01-15.md');
  });

  it('falls back to "conversation" when the title is null or empty', () => {
    const filename = buildExportFilename(
      null,
      new Date('2026-01-15T00:00:00Z'),
      'pdf',
    );
    expect(filename).toBe('conversation-2026-01-15.pdf');
  });
});

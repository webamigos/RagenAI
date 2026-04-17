import { describe, it, expect } from 'vitest';
import { serializeToMarkdown, buildExportFilename } from '../export-thread';
import { Role } from '@/generated/prisma/browser';

const baseDate = new Date('2024-03-15T10:30:00Z');

const baseData = {
  title: 'My Conversation',
  createdAt: baseDate,
  assistantName: 'Support Bot',
  messages: [
    {
      role: Role.USER,
      content: 'Hello, how are you?',
      createdAt: new Date('2024-03-15T10:30:00Z'),
    },
    {
      role: Role.ASSISTANT,
      content: 'I am doing great, thanks!',
      createdAt: new Date('2024-03-15T10:31:00Z'),
    },
  ],
  sources: [],
};

describe('serializeToMarkdown', () => {
  it('renders title, date, assistantName', () => {
    const md = serializeToMarkdown(baseData);
    expect(md).toContain('# My Conversation');
    expect(md).toContain('2024-03-15');
    expect(md).toContain('Support Bot');
  });

  it('falls back to "Conversation" when title is null', () => {
    const md = serializeToMarkdown({ ...baseData, title: null });
    expect(md).toContain('# Conversation');
  });

  it('shows "—" when assistantName is null', () => {
    const md = serializeToMarkdown({ ...baseData, assistantName: null });
    expect(md).toContain('—');
  });

  it('renders all messages with correct role labels', () => {
    const md = serializeToMarkdown(baseData);
    expect(md).toContain('**User**');
    expect(md).toContain('Hello, how are you?');
    expect(md).toContain('**Assistant**');
    expect(md).toContain('I am doing great, thanks!');
  });

  it('omits Sources section when sources array is empty', () => {
    const md = serializeToMarkdown({ ...baseData, sources: [] });
    expect(md).not.toContain('## Sources');
  });

  it('includes Sources section with file names when sources present', () => {
    const md = serializeToMarkdown({
      ...baseData,
      sources: [{ fileName: 'report.pdf' }, { fileName: 'data.xlsx' }],
    });
    expect(md).toContain('## Sources');
    expect(md).toContain('- report.pdf');
    expect(md).toContain('- data.xlsx');
  });

  it('handles empty messages array gracefully', () => {
    const md = serializeToMarkdown({ ...baseData, messages: [] });
    expect(md).toContain('_No messages._');
    expect(md).not.toContain('undefined');
  });
});

describe('buildExportFilename', () => {
  it('slugifies title and appends date and extension', () => {
    const name = buildExportFilename('My Thread', new Date('2024-03-15'), 'md');
    expect(name).toBe('my-thread-2024-03-15.md');
  });

  it('handles null title with fallback "conversation"', () => {
    const name = buildExportFilename(null, new Date('2024-03-15'), 'pdf');
    expect(name).toBe('conversation-2024-03-15.pdf');
  });

  it('truncates slug to 50 characters before appending date', () => {
    const longTitle = 'a'.repeat(60);
    const name = buildExportFilename(longTitle, new Date('2024-03-15'), 'md');
    const slug = name.replace(/-2024-03-15\.md$/, '');
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('strips non-alphanumeric characters except hyphens', () => {
    const name = buildExportFilename(
      'Hello World! #1',
      new Date('2024-03-15'),
      'md',
    );
    expect(name).toMatch(/^[a-z0-9-]+-2024-03-15\.md$/);
  });

  it('falls back to "conversation" when title contains only special characters', () => {
    const name = buildExportFilename('!!!???###', new Date('2024-03-15'), 'md');
    expect(name).toBe('conversation-2024-03-15.md');
  });

  it('does not produce trailing hyphen when slug is exactly 50 chars ending in hyphen', () => {
    const titleWithTrailingHyphen = 'a'.repeat(49) + '-extra';
    const name = buildExportFilename(
      titleWithTrailingHyphen,
      new Date('2024-03-15'),
      'md',
    );
    const slug = name.replace(/-2024-03-15\.md$/, '');
    expect(slug).not.toMatch(/-$/);
  });
});

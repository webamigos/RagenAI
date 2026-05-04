import { describe, it, expect } from 'vitest';
import { parseMarkdownSegments } from '../parse-markdown-segments';

describe('parseMarkdownSegments', () => {
  it('returns a single markdown segment for plain text', () => {
    const result = parseMarkdownSegments('Hello **world**');
    expect(result).toEqual([{ type: 'markdown', content: 'Hello **world**' }]);
  });

  it('returns a single mermaid segment for a bare mermaid block', () => {
    const result = parseMarkdownSegments('```mermaid\ngraph TD\n  A-->B\n```');
    expect(result).toEqual([{ type: 'mermaid', code: 'graph TD\n  A-->B' }]);
  });

  it('splits interleaved markdown and mermaid into ordered segments', () => {
    const input = 'before\n```mermaid\ngraph TD\n  A-->B\n```\nafter';
    expect(parseMarkdownSegments(input)).toEqual([
      { type: 'markdown', content: 'before\n' },
      { type: 'mermaid', code: 'graph TD\n  A-->B' },
      { type: 'markdown', content: '\nafter' },
    ]);
  });

  it('handles multiple mermaid blocks', () => {
    const input =
      '```mermaid\ngraph LR\n  A-->B\n```\ntext\n```mermaid\nsequenceDiagram\n  A->>B: Hi\n```';
    const result = parseMarkdownSegments(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'mermaid', code: 'graph LR\n  A-->B' });
    expect(result[1]).toEqual({ type: 'markdown', content: '\ntext\n' });
    expect(result[2]).toEqual({
      type: 'mermaid',
      code: 'sequenceDiagram\n  A->>B: Hi',
    });
  });

  it('handles an empty mermaid block', () => {
    const result = parseMarkdownSegments('```mermaid\n```');
    expect(result).toEqual([{ type: 'mermaid', code: '' }]);
  });

  it('ignores non-mermaid code fences', () => {
    const input = '```ts\nconst x = 1;\n```';
    expect(parseMarkdownSegments(input)).toEqual([
      { type: 'markdown', content: '```ts\nconst x = 1;\n```' },
    ]);
  });

  it('strips empty string segments', () => {
    const result = parseMarkdownSegments('```mermaid\ngraph TD\n  A-->B\n```');
    const markdownSegments = result.filter((s) => s.type === 'markdown');
    expect(markdownSegments).toHaveLength(0);
  });

  it('matches fence with trailing spaces after ```mermaid', () => {
    const result = parseMarkdownSegments(
      '```mermaid   \ngraph TD\n  A-->B\n```',
    );
    expect(result).toEqual([{ type: 'mermaid', code: 'graph TD\n  A-->B' }]);
  });

  it('matches fence with CRLF line endings', () => {
    const result = parseMarkdownSegments(
      '```mermaid\r\ngraph TD\r\n  A-->B\r\n```',
    );
    expect(result).toEqual([{ type: 'mermaid', code: 'graph TD\r\n  A-->B' }]);
  });

  it('matches fence with uppercase MERMAID (case-insensitive)', () => {
    const result = parseMarkdownSegments('```MERMAID\ngraph TD\n  A-->B\n```');
    expect(result).toEqual([{ type: 'mermaid', code: 'graph TD\n  A-->B' }]);
  });

  it('trims trailing whitespace from mermaid code while preserving surrounding markdown', () => {
    const input = 'intro\n```mermaid\ngraph TD\n  A-->B\n\n\n```\noutro';
    const result = parseMarkdownSegments(input);
    expect(result).toEqual([
      { type: 'markdown', content: 'intro\n' },
      { type: 'mermaid', code: 'graph TD\n  A-->B' },
      { type: 'markdown', content: '\noutro' },
    ]);
  });
});

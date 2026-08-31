import {
  parseStructuredPdfOutput,
  renderPdfSectionPath,
  stripJsonWrapper,
  updateHeadingStack,
} from '../services/chains/pdf-process-rag/parse-structured-pdf-output';

// Silence logger warnings during parser failure tests — the parser is
// designed to log warnings and return null, which is correct behavior.
jest.mock('../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('stripJsonWrapper', () => {
  it('returns bare JSON unchanged', () => {
    const input = '{"sections":[]}';
    expect(stripJsonWrapper(input)).toBe('{"sections":[]}');
  });

  it('strips a ```json code fence with language tag', () => {
    const input = '```json\n{"sections":[]}\n```';
    expect(stripJsonWrapper(input)).toBe('{"sections":[]}');
  });

  it('strips a ```JSON code fence with uppercase tag', () => {
    const input = '```JSON\n{"a":1}\n```';
    expect(stripJsonWrapper(input)).toBe('{"a":1}');
  });

  it('strips a naked ``` wrapper with no language tag', () => {
    const input = '```\n{"a":1}\n```';
    // Falls through the regex branch and hits the bare-backticks branch
    expect(stripJsonWrapper(input)).toBe('{"a":1}');
  });

  it('trims leading/trailing whitespace', () => {
    expect(stripJsonWrapper('  \n{"x":1}\n  ')).toBe('{"x":1}');
  });

  it('removes a leading BOM', () => {
    expect(stripJsonWrapper('\uFEFF{"x":1}')).toBe('{"x":1}');
  });
});

describe('parseStructuredPdfOutput', () => {
  it('returns a validated result on well-formed JSON', () => {
    const raw = JSON.stringify({
      sections: [
        { level: 1, title: 'Introduction', content: 'First paragraph.' },
        {
          level: 2,
          title: '1.1 Background',
          content: 'Background content.',
        },
      ],
    });

    const result = parseStructuredPdfOutput(raw);
    expect(result).not.toBeNull();
    expect(result?.sections).toHaveLength(2);
    expect(result?.sections[0]).toEqual({
      level: 1,
      title: 'Introduction',
      content: 'First paragraph.',
    });
  });

  it('accepts a code-fenced response', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        sections: [{ level: 1, title: 'Title', content: 'Body' }],
      }) +
      '\n```';
    const result = parseStructuredPdfOutput(raw);
    expect(result?.sections).toHaveLength(1);
  });

  it('returns null for empty input', () => {
    expect(parseStructuredPdfOutput('')).toBeNull();
    expect(parseStructuredPdfOutput('   ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseStructuredPdfOutput('not json')).toBeNull();
    expect(parseStructuredPdfOutput('{ invalid')).toBeNull();
  });

  it('returns null when sections key is missing', () => {
    expect(parseStructuredPdfOutput('{"foo":"bar"}')).toBeNull();
  });

  it('returns null when sections is not an array', () => {
    expect(parseStructuredPdfOutput('{"sections":"not an array"}')).toBeNull();
  });

  it('returns null when a section has wrong field types', () => {
    const raw = JSON.stringify({
      sections: [{ level: 'one', title: 'Title', content: 'Body' }],
    });
    expect(parseStructuredPdfOutput(raw)).toBeNull();
  });

  it('returns null when level is out of range', () => {
    const raw = JSON.stringify({
      sections: [{ level: 7, title: 'Title', content: 'Body' }],
    });
    expect(parseStructuredPdfOutput(raw)).toBeNull();
  });

  it('returns null for an empty sections array (nothing to index)', () => {
    expect(parseStructuredPdfOutput('{"sections":[]}')).toBeNull();
  });

  it('accepts empty title strings (preamble content before first heading)', () => {
    const raw = JSON.stringify({
      sections: [{ level: 1, title: '', content: 'Preamble text' }],
    });
    const result = parseStructuredPdfOutput(raw);
    expect(result?.sections[0].title).toBe('');
  });

  it('preserves multiline content verbatim', () => {
    const raw = JSON.stringify({
      sections: [
        {
          level: 1,
          title: 'T',
          content: 'First para.\n\nSecond para.\n\nThird para.',
        },
      ],
    });
    const result = parseStructuredPdfOutput(raw);
    expect(result?.sections[0].content).toBe(
      'First para.\n\nSecond para.\n\nThird para.',
    );
  });
});

describe('updateHeadingStack', () => {
  it('pushes a top-level heading', () => {
    const stack: (string | null)[] = [];
    updateHeadingStack(stack, { level: 1, title: 'Chapter 1', content: '' });
    expect(stack).toEqual(['Chapter 1']);
  });

  it('pushes a subsection under a heading', () => {
    const stack: (string | null)[] = ['Chapter 1'];
    updateHeadingStack(stack, {
      level: 2,
      title: '1.1 Background',
      content: '',
    });
    expect(stack).toEqual(['Chapter 1', '1.1 Background']);
  });

  it('drops deeper levels when a shallower heading appears', () => {
    const stack: (string | null)[] = ['Chapter 1', '1.1 Background', 'Deep'];
    updateHeadingStack(stack, {
      level: 2,
      title: '1.2 Methodology',
      content: '',
    });
    expect(stack).toEqual(['Chapter 1', '1.2 Methodology']);
  });

  it('fills gaps with null when levels are skipped', () => {
    const stack: (string | null)[] = ['Top'];
    updateHeadingStack(stack, { level: 3, title: 'Deep', content: '' });
    expect(stack).toEqual(['Top', null, 'Deep']);
  });

  it('replaces a same-level heading', () => {
    const stack: (string | null)[] = ['Old Heading'];
    updateHeadingStack(stack, { level: 1, title: 'New Heading', content: '' });
    expect(stack).toEqual(['New Heading']);
  });
});

describe('renderPdfSectionPath', () => {
  it('joins non-empty titles with " > "', () => {
    expect(renderPdfSectionPath(['Chapter 1', '1.1 Background'])).toBe(
      'Chapter 1 > 1.1 Background',
    );
  });

  it('skips null slots', () => {
    expect(renderPdfSectionPath(['Top', null, 'Deep'])).toBe('Top > Deep');
  });

  it('skips empty string titles', () => {
    expect(renderPdfSectionPath(['Top', '', 'Deep'])).toBe('Top > Deep');
  });

  it('returns undefined for empty stack', () => {
    expect(renderPdfSectionPath([])).toBeUndefined();
  });

  it('returns undefined when all slots are null or empty', () => {
    expect(renderPdfSectionPath([null, '', null])).toBeUndefined();
  });

  it('trims whitespace in joined titles', () => {
    expect(renderPdfSectionPath(['  Chapter 1  ', ' Subsection '])).toBe(
      'Chapter 1 > Subsection',
    );
  });
});

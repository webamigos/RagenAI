import {
  parseSrtBlocks,
  findSegmentTimestamps,
} from '../services/document-loaders/srt-block-parser';

describe('parseSrtBlocks', () => {
  it('parses a two-block SRT with comma millisecond separator', () => {
    const raw = [
      '1',
      '00:00:01,000 --> 00:00:05,000',
      'Hello world',
      '',
      '2',
      '00:00:06,000 --> 00:00:10,500',
      'Second line',
      '',
    ].join('\n');

    const blocks = parseSrtBlocks(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      index: 1,
      startMs: 1000,
      endMs: 5000,
      text: 'Hello world',
    });
    expect(blocks[1]).toEqual({
      index: 2,
      startMs: 6000,
      endMs: 10500,
      text: 'Second line',
    });
  });

  it('handles dot as millisecond separator', () => {
    const raw = '1\n00:00:01.000 --> 00:00:05.000\nHello\n';
    expect(parseSrtBlocks(raw)).toEqual([
      { index: 1, startMs: 1000, endMs: 5000, text: 'Hello' },
    ]);
  });

  it('handles multi-line subtitle text inside a block', () => {
    const raw = [
      '1',
      '00:01:00,000 --> 00:01:05,000',
      'Line one',
      'Line two',
      '',
    ].join('\n');

    const blocks = parseSrtBlocks(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Line one Line two');
  });

  it('handles CRLF line endings', () => {
    const raw = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n';
    const blocks = parseSrtBlocks(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Hello');
  });

  it('skips malformed blocks silently', () => {
    const raw = [
      '1',
      '00:00:01,000 --> 00:00:05,000',
      'Valid',
      '',
      'not-a-number',
      'garbage',
      'more garbage',
      '',
      '3',
      '00:00:10,000 --> 00:00:15,000',
      'Also valid',
      '',
    ].join('\n');

    const blocks = parseSrtBlocks(raw);
    expect(blocks.map((b) => b.text)).toEqual(['Valid', 'Also valid']);
  });

  it('converts hours + minutes + seconds correctly', () => {
    const raw = '1\n01:02:03,456 --> 01:02:04,789\nTime test\n';
    const blocks = parseSrtBlocks(raw);
    expect(blocks[0].startMs).toBe(1 * 3600000 + 2 * 60000 + 3 * 1000 + 456);
    expect(blocks[0].endMs).toBe(1 * 3600000 + 2 * 60000 + 4 * 1000 + 789);
  });

  it('returns empty array for empty input', () => {
    expect(parseSrtBlocks('')).toEqual([]);
  });
});

describe('findSegmentTimestamps', () => {
  const blocks = [
    { index: 1, startMs: 1000, endMs: 3000, text: 'Hello there everyone' },
    {
      index: 2,
      startMs: 3500,
      endMs: 6000,
      text: 'Welcome to this presentation',
    },
    {
      index: 3,
      startMs: 6500,
      endMs: 9000,
      text: 'Today we will talk about invoicing',
    },
    {
      index: 4,
      startMs: 9500,
      endMs: 12000,
      text: 'and payment processing workflows',
    },
  ];

  it('returns min/max timestamps for a segment spanning multiple blocks', () => {
    const segment =
      'Hello there everyone. Welcome to this presentation. Today we will talk about invoicing.';
    expect(findSegmentTimestamps(segment, blocks)).toEqual({
      timestampStartMs: 1000,
      timestampEndMs: 9000,
    });
  });

  it('returns a single-block match when segment matches only one block', () => {
    const segment = 'Welcome to this presentation';
    expect(findSegmentTimestamps(segment, blocks)).toEqual({
      timestampStartMs: 3500,
      timestampEndMs: 6000,
    });
  });

  it('is case-insensitive', () => {
    const segment = 'HELLO THERE EVERYONE';
    expect(findSegmentTimestamps(segment, blocks)).toEqual({
      timestampStartMs: 1000,
      timestampEndMs: 3000,
    });
  });

  it('tolerates whitespace differences', () => {
    const segment = 'Hello   there\n\neveryone';
    expect(findSegmentTimestamps(segment, blocks)).toEqual({
      timestampStartMs: 1000,
      timestampEndMs: 3000,
    });
  });

  it('falls back to prefix matching for mildly edited segments', () => {
    // LLM has slightly rephrased the end but the first 20 chars still match
    const segment = 'Today we will talk about the invoicing system in depth';
    const result = findSegmentTimestamps(segment, blocks);
    expect(result).toBeDefined();
    expect(result?.timestampStartMs).toBe(6500);
  });

  it('returns undefined when no blocks match', () => {
    const segment = 'Something completely unrelated to the source subtitles';
    expect(findSegmentTimestamps(segment, blocks)).toBeUndefined();
  });

  it('returns undefined for empty segment', () => {
    expect(findSegmentTimestamps('', blocks)).toBeUndefined();
  });

  it('returns undefined for empty blocks list', () => {
    expect(findSegmentTimestamps('Hello there everyone', [])).toBeUndefined();
  });
});

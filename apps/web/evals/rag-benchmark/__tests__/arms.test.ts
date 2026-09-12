import { describe, it, expect } from 'vitest';
import { parseRagStream } from '../lib/arms';

describe('parseRagStream', () => {
  it('concatenates the content deltas in order', () => {
    const raw = [
      'data: {"content":"Zwrot wynosi "}',
      '',
      'data: {"content":"87%."}',
      '',
    ].join('\n');
    expect(parseRagStream(raw).text).toBe('Zwrot wynosi 87%.');
  });

  it('picks up the citations frame', () => {
    const raw = [
      'data: {"content":"87%"}',
      '',
      'event: citations',
      'data: {"fileIds":["file-a","file-b"]}',
      '',
    ].join('\n');
    const parsed = parseRagStream(raw);
    expect(parsed.text).toBe('87%');
    expect(parsed.citedFileIds).toEqual(['file-a', 'file-b']);
  });

  // Heartbeats and control frames are expected on this stream; one of them
  // must not cost the whole answer.
  it('ignores non-JSON frames', () => {
    const raw = ['data: ping', '', 'data: {"content":"ok"}', ''].join('\n');
    expect(parseRagStream(raw).text).toBe('ok');
  });

  it('returns an empty answer for an empty stream rather than throwing', () => {
    expect(parseRagStream('')).toEqual({ text: '', citedFileIds: [] });
  });
});

import { describe, expect, it } from 'vitest';

import {
  CURRENT_CONTEXT_VERSION,
  countByVersion,
  fileContextVersions,
} from '../context-versions';

const point = (metadata: Record<string, unknown>) => ({
  payload: { metadata },
});

describe('fileContextVersions', () => {
  it('takes the lowest version over a file’s body chunks, none being 0', () => {
    const versions = fileContextVersions([
      point({ file_id: 'a', context_version: 1 }),
      point({ file_id: 'a', context_version: 1 }),
      point({ file_id: 'b', context_version: 1 }),
      point({ file_id: 'b' }),
      point({ file_id: 'c' }),
    ]);
    expect(Object.fromEntries(versions)).toEqual({ a: 1, b: 0, c: 0 });
  });

  it('ignores the summary chunk, which is never prefixed, and points with no file', () => {
    const versions = fileContextVersions([
      point({ file_id: 'a', context_version: 1 }),
      point({ file_id: 'a', chunk_type: 'summary' }),
      point({ context_version: 1 }),
      { payload: null },
    ]);
    expect(Object.fromEntries(versions)).toEqual({ a: 1 });
  });

  it('reads a malformed version as none', () => {
    const versions = fileContextVersions([
      point({ file_id: 'a', context_version: '1' }),
      point({ file_id: 'b', context_version: 1.5 }),
      point({ file_id: 'c', context_version: -1 }),
    ]);
    expect(Object.fromEntries(versions)).toEqual({ a: 0, b: 0, c: 0 });
  });
});

describe('countByVersion', () => {
  it('counts files per version, lowest first', () => {
    expect(
      countByVersion(
        new Map([
          ['a', 1],
          ['b', 0],
          ['c', 1],
        ]),
      ),
    ).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});

it('the current version is the free prefix until a model prefix ships', () => {
  expect(CURRENT_CONTEXT_VERSION).toBe(1);
});

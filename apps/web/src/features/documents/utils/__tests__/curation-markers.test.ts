import { describe, expect, it } from 'vitest';

import { curationMarkers } from '../curation-markers';

describe('curationMarkers', () => {
  it('keeps the staging and withdrawal markers, and nothing else', () => {
    expect(
      curationMarkers({
        intake: 'brain',
        retrieval: 'withdrawn',
        driveFileId: 'd1',
        summary: 's',
      }),
    ).toEqual({ intake: 'brain', retrieval: 'withdrawn' });
  });

  it('returns nothing for metadata that is absent or not an object', () => {
    expect(curationMarkers(null)).toEqual({});
    expect(curationMarkers(['intake'])).toEqual({});
    expect(curationMarkers({ driveFileId: 'd1' })).toEqual({});
  });
});

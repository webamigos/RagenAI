import { describe, expect, it } from 'vitest';
import {
  parsePageFilters,
  withPageFilters,
  withFindingType,
} from '../utils/page-filters';

describe('overview links into pages', () => {
  it('rejects malformed parameters and keeps boolean false', () => {
    expect(
      parsePageFilters({
        owner: 'someone',
        published: 'yes',
        file: 'other-org',
      }),
    ).toEqual({});
    expect(
      parsePageFilters({
        owner: ['none'],
        published: 'false',
        file: '11111111-2222-4333-8444-555555555555',
      }),
    ).toEqual({
      owner: 'none',
      published: false,
      file: '11111111-2222-4333-8444-555555555555',
    });
  });
  it('keeps fragments at the end of a filtered finding link', () => {
    expect(
      withFindingType('/brain/findings?lang=pol#finding-123', 'ORPHAN'),
    ).toBe('/brain/findings?lang=pol&type=ORPHAN#finding-123');
    expect(withPageFilters('/brain#page-1', { owner: 'none' })).toBe(
      '/brain?owner=none#page-1',
    );
  });

  it('keeps existing search and language when adding overview filters', () => {
    expect(
      withPageFilters('/brain?lang=pol&q=urlop', {
        owner: 'none',
        published: false,
      }),
    ).toBe('/brain?lang=pol&q=urlop&owner=none&published=false');
    expect(withPageFilters('/brain', {})).toBe('/brain');
  });
});

import { describe, expect, it } from 'vitest';

import { pageStatusVariant } from '../page-status-variant';
import { withSearch } from '../with-search';

describe('pageStatusVariant', () => {
  it('reads approved as ready, what waits on someone as pending, rejected as neutral', () => {
    expect(pageStatusVariant('APPROVED')).toBe('ready');
    expect(pageStatusVariant('CANDIDATE')).toBe('pending');
    expect(pageStatusVariant('STALE')).toBe('pending');
    expect(pageStatusVariant('REJECTED')).toBe('secondary');
  });
});

describe('withSearch', () => {
  it('keeps the title search on a pages-tab link', () => {
    expect(withSearch('/brain?status=APPROVED', 'urlop')).toBe(
      '/brain?status=APPROVED&q=urlop',
    );
    expect(withSearch('/brain', null)).toBe('/brain');
  });
});

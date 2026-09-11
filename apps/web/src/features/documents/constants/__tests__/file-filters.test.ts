import { describe, it, expect } from 'vitest';

import { FILE_FILTER_PARAMS, clearFileFilterParams } from '../file-filters';

describe('clearFileFilterParams', () => {
  /**
   * The bug this list exists to prevent. Two "Reset filters" actions — one on
   * the chip row, one in the grid's empty state — were two hand-written lists
   * of the same names, so the policy chip was cleared by one and left by the
   * other: the grid's reset reloaded the identical empty result, because the
   * filter that emptied it was still in the URL.
   */
  it('drops every filter a chip can set', () => {
    const params = new URLSearchParams(
      'fileType=PDF&embeddingStatus=FAILED&piiPolicy=STRICT',
    );

    clearFileFilterParams(params);

    for (const name of FILE_FILTER_PARAMS) {
      expect(params.has(name)).toBe(false);
    }
  });

  it('returns to the first page, because the old one may not exist', () => {
    const params = new URLSearchParams('fileType=PDF&page=7');

    clearFileFilterParams(params);

    expect(params.get('page')).toBe('1');
  });

  /**
   * Reset clears the filters, not the view. Folder, sort and layout are where
   * you are rather than what you asked for, and dropping them would move
   * someone out of the folder they were looking at.
   */
  it('leaves everything that is not a filter alone', () => {
    const params = new URLSearchParams(
      'fileType=PDF&folderId=f-1&sort=fileName&dir=asc&viewMode=my-files',
    );

    clearFileFilterParams(params);

    expect(params.get('folderId')).toBe('f-1');
    expect(params.get('sort')).toBe('fileName');
    expect(params.get('dir')).toBe('asc');
    expect(params.get('viewMode')).toBe('my-files');
  });
});

import { describe, expect, it } from 'vitest';

import {
  PUBLISHED_FILE_METADATA_KEY,
  publishedFileMetadataSchema,
  readPublishedFileMetadata,
} from '../published-file-metadata';

const block = {
  pageId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
  contentHash: `sha256:${'c'.repeat(64)}`,
  publicationGeneration: 3,
};

describe('publishedFileMetadataSchema', () => {
  it('accepts a page published at generation 0', () => {
    expect(
      publishedFileMetadataSchema.safeParse({
        ...block,
        publicationGeneration: 0,
      }).success,
    ).toBe(true);
  });

  it.each([-1, 1.5, '3'])(
    'refuses the generation %j',
    (publicationGeneration) => {
      expect(
        publishedFileMetadataSchema.safeParse({
          ...block,
          publicationGeneration,
        }).success,
      ).toBe(false);
    },
  );

  it('refuses a page id that is not a publicId', () => {
    expect(
      publishedFileMetadataSchema.safeParse({ ...block, pageId: '42' }).success,
    ).toBe(false);
  });
});

describe('readPublishedFileMetadata', () => {
  it('reads the block from under its key, beside parser output', () => {
    expect(
      readPublishedFileMetadata({
        pageCount: 4,
        [PUBLISHED_FILE_METADATA_KEY]: block,
      }),
    ).toEqual(block);
  });

  it.each([
    ['null metadata', null],
    ['a string', 'x'],
    ['an ordinary uploaded file', { pageCount: 4 }],
  ])('answers null for %s', (_label, metadata) => {
    expect(readPublishedFileMetadata(metadata)).toBeNull();
  });

  // Called while rendering a citation: one malformed row must not take the
  // answer down with it.
  it('answers null for a malformed block rather than throwing', () => {
    expect(
      readPublishedFileMetadata({
        [PUBLISHED_FILE_METADATA_KEY]: { pageId: 'nope' },
      }),
    ).toBeNull();
  });

  // The key is nested on purpose; a top-level `pageId` is not a page.
  it('does not read a pageId at the top level', () => {
    expect(readPublishedFileMetadata(block)).toBeNull();
  });
});

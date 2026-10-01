import { describe, it, expect } from 'vitest';

import { ChangeType } from '@/generated/prisma/client';
import { reindexJobFor } from '../start-file-reindex-command';

describe('reindexJobFor', () => {
  it('re-parses the upload when there is no document or the active version is the upload', () => {
    expect(reindexJobFor(null)).toBe('runFileEmbeddings');
    expect(
      reindexJobFor({ documentId: 'd', changeType: ChangeType.UPLOAD }),
    ).toBe('runFileEmbeddings');
  });

  it.each([
    ChangeType.MANUAL,
    ChangeType.AI_REWRITE,
    ChangeType.AI_OPTIMIZE,
    ChangeType.ROLLBACK,
  ])('re-indexes the active version when it is %s', (changeType) => {
    expect(reindexJobFor({ documentId: 'd', changeType })).toBe(
      'reindexDocumentVersion',
    );
  });
});

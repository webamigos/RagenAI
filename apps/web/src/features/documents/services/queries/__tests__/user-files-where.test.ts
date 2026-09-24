import { describe, expect, it } from 'vitest';

import { buildUserFilesWhere } from '../user-files-where';

describe('buildUserFilesWhere', () => {
  // Spec E10: a published Brain page's file is Brain's output, managed from
  // Brain. Listed here it could be opened as a document with no blob, moved
  // into a folder, or started down a delete path.
  it.each(['all', 'my-files', 'shared-with-me'] as const)(
    'keeps published Brain pages’ files out of the %s view',
    (viewMode) => {
      const where = buildUserFilesWhere({
        organizationId: 'org-1',
        userId: 'u1',
        scope: 'organization',
        viewMode,
      });
      expect(JSON.stringify(where)).toContain('"publishedPages":{"none":{}}');
    },
  );

  // An assistant's import of a knowledge-base file is a second row for the
  // same document, with the same owner and access. It was listed, and
  // counted, beside its original.
  it.each(['all', 'my-files', 'shared-with-me'] as const)(
    'keeps assistant imports out of the %s view',
    (viewMode) => {
      const where = buildUserFilesWhere({
        organizationId: 'org-1',
        userId: 'u1',
        scope: 'organization',
        viewMode,
      });
      expect(where).toMatchObject({ sourceFileId: null });
    },
  );
});

/* eslint-disable no-var */
var mockBindFileWithDocument: Mock;
/* eslint-enable no-var */

vi.mock('../../../services/db/db.js', () => ({
  db: {
    bindFileWithDocument: (...args: unknown[]) =>
      mockBindFileWithDocument(...args),
  },
}));

import type { Mock } from 'vitest';
import { bindFileWithDocument } from '../bind-file-with-document.js';

describe('bindFileWithDocument', () => {
  beforeEach(() => {
    mockBindFileWithDocument = vi.fn().mockResolvedValue(1);
  });

  it('forwards fileId, documentId and orgId positionally, scoping the update by org', async () => {
    await bindFileWithDocument({
      fileId: 'file-1',
      documentId: 'doc-1',
      orgId: 'org-1',
    });

    expect(mockBindFileWithDocument).toHaveBeenCalledWith(
      'file-1',
      'doc-1',
      'org-1',
    );
  });
});

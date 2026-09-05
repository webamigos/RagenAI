/* eslint-disable no-var */
var mockBindFileWithDocument: jest.Mock;
/* eslint-enable no-var */

jest.mock('../../../services/db/db', () => ({
  db: {
    bindFileWithDocument: (...args: unknown[]) =>
      mockBindFileWithDocument(...args),
  },
}));

import { bindFileWithDocument } from '../bind-file-with-document';

describe('bindFileWithDocument', () => {
  beforeEach(() => {
    mockBindFileWithDocument = jest.fn().mockResolvedValue(1);
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

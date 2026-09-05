/* eslint-disable no-var */
var mockGetUserFile: jest.Mock;
/* eslint-enable no-var */

jest.mock('../../../services/db/db', () => ({
  db: {
    getUserFile: (...args: unknown[]) => mockGetUserFile(...args),
  },
}));

jest.mock('../../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { getFileRecord } from '../get-file-record';

describe('getFileRecord', () => {
  beforeEach(() => {
    mockGetUserFile = jest.fn().mockResolvedValue({ id: 'file-1' });
  });

  it('scopes the lookup by org, not fileId alone', async () => {
    await getFileRecord('file-1', 'org-1');

    expect(mockGetUserFile).toHaveBeenCalledWith('file-1', 'org-1');
  });
});

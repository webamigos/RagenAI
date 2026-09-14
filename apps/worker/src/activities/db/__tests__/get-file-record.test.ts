/* eslint-disable no-var */
var mockGetUserFile: Mock;
/* eslint-enable no-var */

vi.mock('../../../services/db/db.js', () => ({
  db: {
    getUserFile: (...args: unknown[]) => mockGetUserFile(...args),
  },
}));

vi.mock('../../../services/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import type { Mock } from 'vitest';
import { getFileRecord } from '../get-file-record.js';

describe('getFileRecord', () => {
  beforeEach(() => {
    mockGetUserFile = vi.fn().mockResolvedValue({ id: 'file-1' });
  });

  it('scopes the lookup by org, not fileId alone', async () => {
    await getFileRecord('file-1', 'org-1');

    expect(mockGetUserFile).toHaveBeenCalledWith('file-1', 'org-1');
  });
});
